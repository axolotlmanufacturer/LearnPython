"""Grading harness for learner-submitted Python.

This module is the *only* implementation of grading semantics in the platform. It
is loaded into Pyodide in two places (docs/architecture.md §3):

  * the browser Web Worker, where a learner presses "Run"; and
  * the Node-based test runner, which uses it for the execution-engine tests and
    for the content tests that run every authored exercise's reference solution
    against its own checks.

Because both paths execute this same file on the same Pyodide build, a learner
cannot hit grading behaviour that CI has not exercised.

The entry point is `run_submission(payload_json) -> result_json`; both sides pass
and receive JSON strings so nothing depends on the JS/Python object bridge.

Design notes worth knowing before editing:

  * Learner code is compiled under the filename "<your code>". Traceback frames
    from any other file are harness frames and are stripped before the learner
    sees them, so reported line numbers always refer to the learner's own editor.
  * `stdout` (what the program printed) and `console` (what the output pane
    shows) are deliberately different. A real terminal echoes what the user types
    at an `input()` prompt, but those characters are not part of the program's
    output. The echo therefore goes to `console` only, so a stdout check is
    comparing against the program's actual output.
  * If the learner's code raises at module level, checks are reported as not-run
    rather than failed. "Your code crashed" and "your function returns the wrong
    value" are different lessons and should not be conflated in the feedback.
"""

from __future__ import annotations

import ast
import builtins
import io
import json
import linecache
import math
import time
import traceback
from typing import Any

LEARNER_FILENAME = "<your code>"

# Guards against a learner (or an authored exercise) printing megabytes into the
# output pane and freezing the browser tab. The limit is generous enough that no
# legitimate beginner exercise reaches it.
MAX_OUTPUT_CHARS = 200_000


class OutputLimitExceeded(Exception):
    """Raised internally when a program produces an unreasonable amount of output."""


class _Recorder:
    """Collects program output, preserving the interleaving of the streams.

    `stdout`/`stderr` accumulate the program's real output for checking.
    `console` records ordered segments — including echoed input, which is *not*
    program output — for display.
    """

    def __init__(self) -> None:
        self.stdout_parts: list[str] = []
        self.stderr_parts: list[str] = []
        self.console: list[dict[str, str]] = []
        self._total = 0
        self.truncated = False

    def write(self, stream: str, text: str) -> None:
        if not text:
            return
        self._total += len(text)
        if self._total > MAX_OUTPUT_CHARS:
            if not self.truncated:
                self.truncated = True
                self.console.append(
                    {
                        "stream": "err",
                        "text": (
                            "\n[Output stopped: this program printed far more than expected. "
                            "That usually means something is printing inside a loop that "
                            "does not end.]\n"
                        ),
                    }
                )
            raise OutputLimitExceeded

        if stream == "out":
            self.stdout_parts.append(text)
        elif stream == "err":
            self.stderr_parts.append(text)

        # Merge consecutive segments from the same stream to keep the payload small.
        if self.console and self.console[-1]["stream"] == stream:
            self.console[-1]["text"] += text
        else:
            self.console.append({"stream": stream, "text": text})

    @property
    def stdout(self) -> str:
        return "".join(self.stdout_parts)

    @property
    def stderr(self) -> str:
        return "".join(self.stderr_parts)


class _RecordingStream(io.TextIOBase):
    """A file-like object that forwards writes into a `_Recorder`."""

    def __init__(self, recorder: _Recorder, stream: str) -> None:
        self._recorder = recorder
        self._stream = stream

    def write(self, text: str) -> int:  # type: ignore[override]
        self._recorder.write(self._stream, text)
        return len(text)

    def writable(self) -> bool:  # type: ignore[override]
        return True

    def flush(self) -> None:  # type: ignore[override]
        return None


def _make_input(lines: list[str], recorder: _Recorder):
    """Build a stand-in for `input()` fed by pre-supplied lines.

    The prompt goes to stdout, exactly as CPython's `input()` does. The value goes
    only to the console, because a terminal's echo is not program output.
    """
    pending = list(lines)

    def _input(prompt: object = "") -> str:
        if prompt != "":
            recorder.write("out", str(prompt))
        if not pending:
            raise EOFError(
                "Your program asked for input, but there was no input left to give it."
            )
        value = pending.pop(0)
        recorder.write("in", value + "\n")
        return value

    return _input


# --------------------------------------------------------------------------
# Error reporting
# --------------------------------------------------------------------------


def _register_source(source: str) -> None:
    """Make the learner's code visible to `traceback` and `linecache`.

    The code is compiled from a string, not a file, so by default every frame in
    a traceback shows a line number with no source line beside it — which is
    exactly the part a beginner needs. Seeding `linecache` under the same
    pseudo-filename restores it.
    """
    lines = source.splitlines(keepends=True)
    linecache.cache[LEARNER_FILENAME] = (len(source), None, lines, LEARNER_FILENAME)


def _forget_source() -> None:
    linecache.cache.pop(LEARNER_FILENAME, None)


def _learner_frames(tb: Any) -> list[traceback.FrameSummary]:
    """Keep only the stack frames that belong to the learner's own code."""
    return [f for f in traceback.extract_tb(tb) if f.filename == LEARNER_FILENAME]


def _describe_exception(exc: BaseException) -> dict[str, Any]:
    """Turn an exception into a structured, learner-facing description.

    The plain-language explanation is added on the TypeScript side
    (errorMapping.ts) so it can be unit-tested exhaustively without booting a
    Python interpreter; this function's job is to report accurate facts.
    """
    if isinstance(exc, SyntaxError):
        # A SyntaxError never executed, so it has no meaningful traceback; its
        # position lives on the exception itself.
        detail = {
            "type": type(exc).__name__,
            "message": str(exc.msg),
            "line": exc.lineno,
            "column": exc.offset,
            "text": (exc.text or "").rstrip("\n"),
        }
        rendered = "".join(
            traceback.format_exception_only(type(exc), exc)  # type: ignore[arg-type]
        )
        detail["traceback"] = rendered.strip()
        return detail

    frames = _learner_frames(exc.__traceback__)
    last = frames[-1] if frames else None
    rendered = "".join(
        traceback.format_list(frames)
        + traceback.format_exception_only(type(exc), exc)  # type: ignore[arg-type]
    )
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "line": last.lineno if last else None,
        "column": None,
        "text": (last.line or "").strip() if last else "",
        "traceback": ("Traceback (most recent call last):\n" + rendered).strip()
        if frames
        else rendered.strip(),
    }


# --------------------------------------------------------------------------
# Value comparison
# --------------------------------------------------------------------------


def _normalise(value: Any) -> Any:
    """Make Python values comparable with values that arrived as JSON.

    JSON has no tuples or sets, so an exercise author writing `expected: [1, 2]`
    should match a learner function that returns `(1, 2)`. Dict keys arriving
    from JSON are always strings.
    """
    if isinstance(value, tuple):
        return [_normalise(v) for v in value]
    if isinstance(value, list):
        return [_normalise(v) for v in value]
    if isinstance(value, set | frozenset):
        return sorted((_normalise(v) for v in value), key=repr)
    if isinstance(value, dict):
        return {str(k): _normalise(v) for k, v in value.items()}
    return value


def _values_equal(actual: Any, expected: Any, tolerance: float | None) -> bool:
    a, e = _normalise(actual), _normalise(expected)

    if tolerance is not None and isinstance(a, int | float) and isinstance(e, int | float):
        if isinstance(a, bool) or isinstance(e, bool):
            return a == e
        if math.isnan(float(a)) and math.isnan(float(e)):
            return True
        return abs(float(a) - float(e)) <= tolerance

    if tolerance is not None and isinstance(a, list) and isinstance(e, list):
        return len(a) == len(e) and all(
            _values_equal(x, y, tolerance) for x, y in zip(a, e, strict=True)
        )

    # bool is a subclass of int; 1 == True must not pass a check expecting True.
    if isinstance(e, bool) != isinstance(a, bool):
        return False

    return bool(a == e)


def _normalise_text(text: str) -> str:
    """Forgive the whitespace differences beginners produce, and nothing else."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").split("\n")]
    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _short_repr(value: Any, limit: int = 160) -> str:
    try:
        text = repr(value)
    except Exception:  # pragma: no cover - repr of a broken object
        text = f"<unprintable {type(value).__name__}>"
    return text if len(text) <= limit else text[: limit - 1] + "…"


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------


def _check_stdout(check: dict[str, Any], stdout: str) -> dict[str, Any]:
    mode = check.get("match", "normalized")
    expected = str(check.get("expected", ""))

    if mode == "exact":
        actual_cmp, expected_cmp = stdout, expected
        passed = actual_cmp == expected_cmp
    elif mode == "contains":
        actual_cmp, expected_cmp = _normalise_text(stdout), _normalise_text(expected)
        passed = expected_cmp in actual_cmp
    else:  # "normalized"
        actual_cmp, expected_cmp = _normalise_text(stdout), _normalise_text(expected)
        passed = actual_cmp == expected_cmp

    return {
        "passed": passed,
        "expected": expected_cmp,
        "actual": actual_cmp,
        "detail": None
        if passed
        else (
            "Your program did not print what this exercise expects."
            if mode != "contains"
            else "Your program's output does not contain the expected text."
        ),
    }


def _check_call(check: dict[str, Any], namespace: dict[str, Any], recorder: _Recorder):
    name = check["function"]
    target = namespace.get(name)

    if target is None:
        return {
            "passed": False,
            "expected": f"a function named {name}",
            "actual": "not defined",
            "detail": (
                f"This exercise needs a function called `{name}`, but your code does not "
                f"define one. Check the spelling — Python is case-sensitive."
            ),
        }
    if not callable(target):
        return {
            "passed": False,
            "expected": f"a function named {name}",
            "actual": f"{name} is a {type(target).__name__}",
            "detail": (
                f"`{name}` exists in your code, but it is a {type(target).__name__} rather "
                f"than a function, so it cannot be called."
            ),
        }

    args = check.get("args", []) or []
    kwargs = check.get("kwargs", {}) or {}
    tolerance = check.get("tolerance")

    try:
        result = target(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - the learner's exception is the finding
        recorder.write("err", "")
        return {
            "passed": False,
            "expected": _short_repr(check.get("expected")),
            "actual": f"raised {type(exc).__name__}",
            "detail": (
                f"Calling `{_call_repr(name, args, kwargs)}` raised "
                f"{type(exc).__name__}: {exc}"
            ),
            "error": _describe_exception(exc),
        }

    if "expected" not in check:
        passed = bool(result)
        return {
            "passed": passed,
            "expected": "a true value",
            "actual": _short_repr(result),
            "detail": None
            if passed
            else f"`{_call_repr(name, args, kwargs)}` returned {_short_repr(result)}.",
        }

    passed = _values_equal(result, check["expected"], tolerance)
    detail = None
    if not passed:
        detail = (
            f"`{_call_repr(name, args, kwargs)}` returned {_short_repr(result)}, "
            f"but this exercise expects {_short_repr(check['expected'])}."
        )
        if result is None:
            detail += " A function that has no `return` statement gives back `None`."
    return {
        "passed": passed,
        "expected": _short_repr(check["expected"]),
        "actual": _short_repr(result),
        "detail": detail,
    }


def _call_repr(name: str, args: list[Any], kwargs: dict[str, Any]) -> str:
    parts = [_short_repr(a, 40) for a in args]
    parts += [f"{k}={_short_repr(v, 40)}" for k, v in kwargs.items()]
    return f"{name}({', '.join(parts)})"


def _check_expr(check: dict[str, Any], namespace: dict[str, Any]) -> dict[str, Any]:
    expression = check["expression"]
    tolerance = check.get("tolerance")

    try:
        value = eval(expression, namespace)  # noqa: S307 - authored content, not learner input
    except NameError as exc:
        missing = str(exc).split("'")[1] if "'" in str(exc) else "a variable"
        return {
            "passed": False,
            "expected": _short_repr(check.get("expected", "a true value")),
            "actual": "not defined",
            "detail": (
                f"This exercise looks for `{missing}`, but your code never creates it. "
                f"Check the spelling — Python is case-sensitive."
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "passed": False,
            "expected": _short_repr(check.get("expected", "a true value")),
            "actual": f"raised {type(exc).__name__}",
            "detail": f"Checking `{expression}` raised {type(exc).__name__}: {exc}",
        }

    if "expected" not in check:
        passed = bool(value)
        return {
            "passed": passed,
            "expected": "a true value",
            "actual": _short_repr(value),
            "detail": None if passed else f"`{expression}` was {_short_repr(value)}.",
        }

    passed = _values_equal(value, check["expected"], tolerance)
    return {
        "passed": passed,
        "expected": _short_repr(check["expected"]),
        "actual": _short_repr(value),
        "detail": None
        if passed
        else (
            f"`{expression}` is {_short_repr(value)}, but this exercise expects "
            f"{_short_repr(check['expected'])}."
        ),
    }


def _check_source(check: dict[str, Any], source: str) -> dict[str, Any]:
    """Check a property of the learner's source, for exercises about technique.

    AST node names rather than substrings, because searching a program's text for
    "for" also matches "before" and "information".
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {
            "passed": False,
            "expected": "code that runs",
            "actual": "a syntax error",
            "detail": "This check could not run because the code has a syntax error.",
        }

    present = {type(node).__name__ for node in ast.walk(tree)}

    for required in check.get("require_ast", []) or []:
        if required not in present:
            return {
                "passed": False,
                "expected": f"code using {_AST_LABELS.get(required, required)}",
                "actual": "not found",
                "detail": (
                    f"This exercise is practising {_AST_LABELS.get(required, required)}, "
                    f"so your solution needs to use one."
                ),
            }

    for forbidden in check.get("forbid_ast", []) or []:
        if forbidden in present:
            return {
                "passed": False,
                "expected": f"code without {_AST_LABELS.get(forbidden, forbidden)}",
                "actual": "found",
                "detail": (
                    f"For this exercise, try solving it without "
                    f"{_AST_LABELS.get(forbidden, forbidden)}."
                ),
            }

    for text in check.get("require_text", []) or []:
        if text not in source:
            return {
                "passed": False,
                "expected": f"code containing {text!r}",
                "actual": "not found",
                "detail": f"Your solution needs to use `{text}`.",
            }

    for text in check.get("forbid_text", []) or []:
        if text in source:
            return {
                "passed": False,
                "expected": f"code without {text!r}",
                "actual": "found",
                "detail": f"For this exercise, try solving it without using `{text}`.",
            }

    return {"passed": True, "expected": None, "actual": None, "detail": None}


_AST_LABELS = {
    "For": "a `for` loop",
    "While": "a `while` loop",
    "If": "an `if` statement",
    "FunctionDef": "a function definition",
    "ClassDef": "a class definition",
    "Try": "a `try`/`except` block",
    "ListComp": "a list comprehension",
    "Return": "a `return` statement",
    "Import": "an `import` statement",
    "ImportFrom": "an `import` statement",
}


def _run_checks(
    checks: list[dict[str, Any]],
    namespace: dict[str, Any],
    stdout: str,
    source: str,
    recorder: _Recorder,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, check in enumerate(checks):
        kind = check.get("kind", "stdout")
        label = check.get("label") or f"Check {index + 1}"

        if kind == "stdout":
            outcome = _check_stdout(check, stdout)
        elif kind == "call":
            outcome = _check_call(check, namespace, recorder)
        elif kind == "expr":
            outcome = _check_expr(check, namespace)
        elif kind == "source":
            outcome = _check_source(check, source)
        else:
            outcome = {
                "passed": False,
                "expected": None,
                "actual": None,
                "detail": f"Unknown check kind {kind!r}. This is a bug in the exercise.",
            }

        results.append({"label": label, "status": "passed" if outcome["passed"] else "failed", **outcome})
    return results


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------


def run_submission(payload_json: str) -> str:
    """Run learner code and evaluate its checks.

    Payload: {"code": str, "stdin": [str], "checks": [check]}
    Returns a JSON string; see ExecutionResult in types.ts for the shape.
    """
    payload = json.loads(payload_json)
    source: str = payload.get("code", "")
    stdin: list[str] = payload.get("stdin") or []
    checks: list[dict[str, Any]] = payload.get("checks") or []

    recorder = _Recorder()
    namespace: dict[str, Any] = {
        "__name__": "__main__",
        "__builtins__": builtins,
    }
    namespace["input"] = _make_input(stdin, recorder)

    started = time.perf_counter()
    error: dict[str, Any] | None = None
    status = "ok"

    import sys

    _register_source(source)
    real_stdout, real_stderr = sys.stdout, sys.stderr
    sys.stdout = _RecordingStream(recorder, "out")  # type: ignore[assignment]
    sys.stderr = _RecordingStream(recorder, "err")  # type: ignore[assignment]
    try:
        try:
            compiled = compile(source, LEARNER_FILENAME, "exec")
        except SyntaxError as exc:
            error = _describe_exception(exc)
            status = "error"
        else:
            try:
                exec(compiled, namespace)  # noqa: S102 - this is the product
            except OutputLimitExceeded:
                status = "error"
                error = {
                    "type": "OutputLimit",
                    "message": "This program produced far more output than expected.",
                    "line": None,
                    "column": None,
                    "text": "",
                    "traceback": "",
                }
            except SystemExit:
                pass
            except BaseException as exc:  # noqa: BLE001 - report anything the learner hits
                error = _describe_exception(exc)
                status = "error"
    finally:
        sys.stdout, sys.stderr = real_stdout, real_stderr

    stdout = recorder.stdout

    if checks:
        if status == "error":
            check_results = [
                {
                    "label": check.get("label") or f"Check {i + 1}",
                    "status": "not_run",
                    "passed": False,
                    "expected": None,
                    "actual": None,
                    "detail": "Not checked, because the code stopped with an error first.",
                }
                for i, check in enumerate(checks)
            ]
        else:
            check_results = _run_checks(checks, namespace, stdout, source, recorder)
    else:
        check_results = []

    passed = status == "ok" and all(c["passed"] for c in check_results)
    # Checks can raise too, and their tracebacks reference the learner's code,
    # so the cache is only dropped once everything has run.
    _forget_source()

    return json.dumps(
        {
            "status": status,
            "stdout": stdout,
            "stderr": recorder.stderr,
            "console": recorder.console,
            "error": error,
            "checks": check_results,
            "passed": passed,
            "truncated": recorder.truncated,
            "durationMs": round((time.perf_counter() - started) * 1000, 3),
        }
    )
