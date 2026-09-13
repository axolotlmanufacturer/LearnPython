"""Track B exercises, verified against CPython with the real libraries.

Why here and not with the other content tests
---------------------------------------------
Every Track A exercise is run through `harness.py` in a real Pyodide interpreter
by apps/web/tests/content.test.ts, which is the strongest available check: the
same engine a learner uses. Track B cannot have that in CI as things stand,
because pandas and scipy are compiled wasm wheels fetched from the distribution
CDN at runtime — the npm package does not ship them, so neither the Node runner
nor the self-hosting end-to-end suite can execute a pandas exercise.

`harness.py` is pure Python and is already designed to run in more than one
place. Running it in a third — CPython, with real pandas and scipy — verifies
the thing most likely to be wrong, which is the content: does the reference
solution actually satisfy the checks the author wrote, and does the starter code
actually fail them?

What this does not prove, stated so nobody mistakes a green suite for more than
it is: that the wheels load in a browser, that `loadPackage` resolves them, or
that a scipy call behaves identically compiled to WebAssembly. Those need one
run against a reachable CDN and are tracked in docs/spike-scientific-stack.md §5.

The version skew between the two runtimes is small (numpy identical, pandas and
scipy one patch/minor apart) and recorded in that same document.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

from app.config import get_settings
from app.content.loader import harness_payload, load_curriculum
from app.content.schema import ExerciseFile

# apps/api/tests/ -> repository root -> the harness the browser also runs.
HARNESS = (
    Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "lib" / "python" / "harness.py"
)


def _packaged_exercises() -> list[tuple[str, ExerciseFile]]:
    """Every authored exercise that declares packages, with a readable id."""
    curriculum = load_curriculum(get_settings().content_dir)
    found: list[tuple[str, ExerciseFile]] = []
    for module in curriculum.modules:
        for lesson in module.lessons:
            for exercise in lesson.exercises:
                if exercise.packages:
                    found.append((f"{module.slug}/{lesson.slug}/{exercise.slug}", exercise))
    return found


EXERCISES = _packaged_exercises()

#: Union of everything the authored content asks for, so a missing library is
#: reported once and clearly rather than as a wall of identical failures.
REQUIRED = sorted({name for _, exercise in EXERCISES for name in exercise.packages})
MISSING = [name for name in REQUIRED if importlib.util.find_spec(name) is None]

pytestmark = pytest.mark.skipif(
    bool(MISSING),
    reason=(
        f"Track B verification needs {', '.join(MISSING)} installed in this environment. "
        f"Install with: uv pip install --python .venv/bin/python {' '.join(MISSING)}"
    ),
)


def _run(code: str, exercise: ExerciseFile) -> dict[str, Any]:
    """Grade `code` with the same harness and payload the browser would use."""
    namespace: dict[str, Any] = {"__name__": "__harness__"}
    exec(compile(HARNESS.read_text(encoding="utf-8"), str(HARNESS), "exec"), namespace)

    payload = json.dumps(
        {
            "code": code,
            "stdin": list(exercise.stdin),
            "checks": harness_payload(exercise),
            "files": dict(exercise.files),
        }
    )
    return json.loads(namespace["run_submission"](payload))


def test_there_are_track_b_exercises_to_check():
    # Without this the whole module would pass vacuously the day the content
    # walk stops finding anything.
    assert EXERCISES, "no exercises declare packages — has Track B content moved?"


@pytest.mark.parametrize(("where", "exercise"), EXERCISES, ids=[w for w, _ in EXERCISES])
def test_the_reference_solution_passes_its_own_checks(where: str, exercise: ExerciseFile):
    result = _run(exercise.solution_code, exercise)

    failures = "\n".join(
        f"  - {check['label']}: {check.get('detail') or 'failed'}"
        for check in result["checks"]
        if not check["passed"]
    )
    error = result.get("error")
    assert result["passed"], (
        f"The reference solution for {where} does not pass its own checks.\n"
        + (f"  Error: {error['type']}: {error['message']}\n" if error else "")
        + failures
    )


@pytest.mark.parametrize(("where", "exercise"), EXERCISES, ids=[w for w, _ in EXERCISES])
def test_the_starter_code_does_not_already_pass(where: str, exercise: ExerciseFile):
    # An exercise whose starting point already passes is not an exercise, and a
    # check that asserts nothing passes everything. `predict` is the one
    # legitimate exception: the code is complete by design and the work happens
    # in the learner's head before they press Run.
    if exercise.scaffold_level.value == "predict":
        pytest.skip("predict exercises ship complete by design")

    result = _run(exercise.starter_code, exercise)

    assert not result["passed"], (
        f"The starter code for {where} already passes every check, so there is "
        f"nothing for the learner to do."
    )
