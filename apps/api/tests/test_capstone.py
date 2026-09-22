"""The Track B capstone's grading, tested against the mistakes it exists to catch.

§11.1 of the brief: "the Module 16 capstone's automated component correctly
distinguishes the dataset's known true-positive and true-negative features at a
documented tolerance". test_dataset.py shows the tolerance *function* separates
good pipelines from bad ones. This goes one step further and runs the capstone
exercise's own authored checks — the ones a learner is actually graded by —
against variants of its reference solution:

  * defensible choices a learner might make, which must still pass; and
  * the two mistakes the whole track is built around, which must fail.

A grader that passes everything, or only the reference, fails here.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.config import get_settings
from app.content.loader import harness_payload, load_curriculum
from app.content.schema import ExerciseFile

pytest.importorskip("scipy")
pytest.importorskip("pandas")

HARNESS = (
    Path(__file__).resolve().parents[3] / "apps" / "web" / "src" / "lib" / "python" / "harness.py"
)


def _exercise(slug: str) -> ExerciseFile:
    for module in load_curriculum(get_settings().content_dir).modules:
        for lesson in module.lessons:
            for exercise in lesson.exercises:
                if exercise.slug == slug:
                    return exercise
    raise AssertionError(f"no exercise {slug!r}")


CAPSTONE = _exercise("find-what-changed")


def _grade(code: str) -> dict[str, Any]:
    namespace: dict[str, Any] = {"__name__": "__harness__"}
    exec(compile(HARNESS.read_text(encoding="utf-8"), str(HARNESS), "exec"), namespace)
    payload = {
        "code": code,
        "checks": harness_payload(CAPSTONE),
        "files": dict(CAPSTONE.files),
    }
    return json.loads(namespace["run_submission"](json.dumps(payload)))


def _variant(*replacements: tuple[str, str]) -> str:
    code = CAPSTONE.solution_code
    for old, new in replacements:
        assert old in code, f"the reference solution no longer contains {old!r}"
        code = code.replace(old, new)
    return code


BH_LINE = 'results["p_adj"] = benjamini_hochberg(list(results["p"]))'


def _failed(result: dict[str, Any]) -> list[str]:
    return [c["label"] for c in result["checks"] if not c["passed"]]


def test_the_reference_solution_passes():
    result = _grade(CAPSTONE.solution_code)
    assert result["passed"], _failed(result)


@pytest.mark.parametrize(
    "replacements",
    [
        [(BH_LINE, 'results["p_adj"] = (results["p"] * len(results)).clip(upper=1.0)')],
        [("return kept - kept.median()", "return kept")],
    ],
    ids=["bonferroni-instead-of-bh", "no-normalisation"],
)
def test_defensible_choices_still_pass(replacements):
    # A different, reasonable method is not a wrong answer. The lesson tells
    # learners so; this is what makes the lesson true.
    result = _grade(_variant(*replacements))
    assert result["passed"], _failed(result)


def test_skipping_the_multiple_testing_correction_fails():
    # Module 14's central idea. With the effect threshold in play, a missing
    # correction could hide in the final list — which is why the capstone also
    # judges the adjusted p-values on their own.
    result = _grade(_variant((BH_LINE, 'results["p_adj"] = results["p"]')))

    assert not result["passed"]
    assert any("multiple testing" in label for label in _failed(result))


def test_reading_conditions_off_column_order_fails():
    # Module 11's warning: the samples are interleaved, so "first six are
    # controls" silently compares mixed groups.
    result = _grade(
        _variant(
            (
                'control = samples.loc[samples["condition"] == "control", "sample_id"]',
                'control = samples["sample_id"][:6]',
            ),
            (
                'treated = samples.loc[samples["condition"] == "treated", "sample_id"]',
                'treated = samples["sample_id"][6:]',
            ),
        )
    )

    assert not result["passed"]
    assert any("truly shifted" in label for label in _failed(result))


def test_copying_scipys_statistic_is_not_caught_by_the_checks():
    # Stated rather than hidden: the checks cannot tell a t statistic computed
    # from the formula from one copied out of scipy, because they are equal by
    # design. That is left to the rubric ("Is your t statistic computed from its
    # formula...?"), which is the honest place for it on a platform that issues
    # no assessment. If this ever starts failing, someone has found a way to
    # check it automatically — update the rubric to match.
    result = _grade(_variant(('"t": welch_t(a, b),', '"t": scipy_result.statistic,')))
    assert result["passed"]
