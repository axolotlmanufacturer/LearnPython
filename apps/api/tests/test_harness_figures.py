"""The grading harness's figure support, exercised under CPython.

The harness runs in the browser under Pyodide; matplotlib's wasm wheel is not
reachable from this environment (docs/spike-scientific-stack.md §4), so this is
the one place the figure path actually executes before a real browser run. It
covers what matters most: that figures reach the result with honest alt text,
that checks can see them, that nothing leaks between runs, and that a Track A
run — no matplotlib at all — is untouched.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import pytest

pytest.importorskip("matplotlib")

HARNESS = (
    Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "lib" / "python" / "harness.py"
)


@pytest.fixture(scope="module")
def run():
    namespace: dict[str, Any] = {"__name__": "__harness__"}
    exec(compile(HARNESS.read_text(encoding="utf-8"), str(HARNESS), "exec"), namespace)

    def _run(code: str, checks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        payload = json.dumps({"code": code, "checks": checks or []})
        return json.loads(namespace["run_submission"](payload))

    return _run


LABELLED_SCATTER = """
import matplotlib.pyplot as plt
plt.scatter([1, 2, 3], [4, 5, 6])
plt.title("Growth")
plt.xlabel("day")
plt.ylabel("height")
plt.show()
"""


def test_a_figure_reaches_the_result_as_a_png(run):
    result = run(LABELLED_SCATTER)

    assert result["status"] == "ok"
    assert len(result["figures"]) == 1
    assert base64.b64decode(result["figures"][0]["png"]).startswith(b"\x89PNG")


def test_alt_text_describes_what_was_actually_drawn(run):
    alt = run(LABELLED_SCATTER)["figures"][0]["alt"]

    assert "Growth" in alt
    assert "day" in alt and "height" in alt
    assert "3 points" in alt


def test_alt_text_says_so_when_axes_are_unlabelled(run):
    # Accurate, and the same nudge a reviewer would give.
    alt = run("import matplotlib.pyplot as plt\nplt.plot([1, 2, 3])")["figures"][0]["alt"]

    assert "Untitled" in alt and "unlabelled" in alt


def test_show_does_not_print_a_warning_into_the_output(run):
    # Under Agg, plt.show() warns that the canvas is non-interactive. That is
    # true and irrelevant, and in a beginner's output pane it reads as an error.
    result = run(LABELLED_SCATTER)

    assert result["stderr"] == ""


def test_checks_can_inspect_plots_without_knowing_the_import_alias(run):
    code = LABELLED_SCATTER.replace(
        "import matplotlib.pyplot as plt", "import matplotlib.pyplot as p"
    )
    code = code.replace("plt.", "p.")
    result = run(
        code,
        [
            {
                "kind": "expr",
                "label": "Has one plot",
                "expression": "len(__plots__)",
                "expected": 1,
            },
            {
                "kind": "expr",
                "label": "Labels the horizontal axis",
                "expression": "__plots__[0]['xlabel']",
                "expected": "day",
            },
            {
                "kind": "expr",
                "label": "Draws three points",
                "expression": "__plots__[0]['points']",
                "expected": 3,
            },
        ],
    )

    assert result["passed"], result["checks"]


def test_plots_are_not_visible_in_the_learners_namespace(run):
    # A learner who happens to name something `__plots__` is not overwriting
    # ours, and ours never appears among theirs.
    result = run("print('__plots__' in globals())")

    assert result["stdout"].strip() == "False"


def test_figures_do_not_leak_into_the_next_run(run):
    run(LABELLED_SCATTER)
    after = run("print('no plotting here')")

    assert after["figures"] == []


def test_a_crash_after_plotting_still_shows_the_partial_figure(run):
    # A half-drawn plot is often the clue to what went wrong.
    result = run("import matplotlib.pyplot as plt\nplt.plot([1, 2])\n1 / 0")

    assert result["status"] == "error"
    assert len(result["figures"]) == 1


def test_the_number_of_figures_is_capped(run):
    result = run("import matplotlib.pyplot as plt\nfor _ in range(10):\n    plt.figure()\n")

    assert len(result["figures"]) == 4


def test_numpy_booleans_compare_equal_to_true(run):
    # np.bool_ is not a subclass of bool, so without normalisation a correct
    # answer computed with numpy was marked wrong against `expected: true`.
    pytest.importorskip("numpy")
    result = run(
        "import numpy as np\nflag = np.array([1, 2]).sum() == 3",
        [{"kind": "expr", "label": "Flag is true", "expression": "flag", "expected": True}],
    )

    assert result["passed"], result["checks"]


def test_a_pandas_series_compares_by_value(run):
    pytest.importorskip("pandas")
    result = run(
        "import pandas as pd\nvalues = pd.Series([1.0, 2.5])",
        [
            {
                "kind": "expr",
                "label": "Values are right",
                "expression": "values",
                "expected": [1.0, 2.5],
                "tolerance": 1e-9,
            }
        ],
    )

    assert result["passed"], result["checks"]
