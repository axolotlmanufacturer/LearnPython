"""Track B's synthetic dataset: reproducible, and true to its own ground truth.

The Module 16 capstone grades a learner's pipeline against the features that
were *actually* shifted when the data was generated (brief §5A, §11.1). That
only means anything if three things hold, and each is asserted here:

1. The committed CSVs are exactly what the documented, seeded generator
   produces — so the ground truth is not a claim about some other data.
2. The generator's own invariants hold: gaps only where the filter removes
   them, shifted features only where they can be measured.
3. A correct analysis recovers the truth, and the grading tolerance separates
   correct pipelines from the specific mistakes the track teaches against.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import numpy as np
import pandas as pd
import pytest

DATASETS = Path(__file__).resolve().parents[3] / "content" / "datasets"

pytest.importorskip("scipy", reason="the dataset generator needs scipy to verify itself")


def _load_generator() -> ModuleType:
    spec = importlib.util.spec_from_file_location("generate", DATASETS / "generate.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


GEN = _load_generator()


@pytest.fixture(scope="module")
def committed() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    return (
        pd.read_csv(DATASETS / "expression.csv", index_col=0),
        pd.read_csv(DATASETS / "samples.csv"),
        pd.read_csv(DATASETS / "truth.csv"),
    )


# ------------------------------------------------------------ reproducibility


def test_the_committed_files_are_what_the_generator_produces(tmp_path, monkeypatch):
    # Regenerate into a scratch directory and compare bytes. If this fails, the
    # CSVs were edited by hand or the generator changed without being re-run —
    # either way the capstone's ground truth no longer describes the data.
    monkeypatch.setattr(GEN, "HERE", tmp_path)
    GEN.write(*GEN.generate())

    for name in [
        "expression.csv",
        "samples.csv",
        "truth.csv",
        "expression_corner.csv",
        "results.csv",
    ]:
        assert (tmp_path / name).read_bytes() == (DATASETS / name).read_bytes(), (
            f"{name} differs from a fresh run of content/datasets/generate.py — "
            f"re-run the generator and commit the result"
        )


def test_the_generators_invariants_hold():
    GEN.check_invariants(*GEN.generate())


def test_normalisation_does_not_manufacture_differences(committed):
    # The regression this exists for: when the shifted features were assigned
    # up/down at random, they dragged the treated samples' medians, and centring
    # on those medians planted a false difference in every unchanged feature —
    # false positives among the nulls doubled, and their p-values were no longer
    # uniform. A reference analysis that manufactures findings is not a
    # reference. Under a correct test, null p-values are uniform.
    from scipy import stats

    expression, samples, truth = committed
    results = GEN.reference_pipeline(expression, samples)
    null = results.loc[~truth.set_index("feature").loc[results.index, "shifted"], "p"]

    assert stats.kstest(null, "uniform").pvalue > 0.05
    # ~5% of 140 is 7; the 99.9th percentile of that binomial is about 15.
    assert (null < 0.05).sum() <= 12


def test_the_shape_matches_the_brief(committed):
    # §5A: "100-300 features x 12-24 samples across two conditions".
    expression, samples, _ = committed
    assert 100 <= expression.shape[0] <= 300
    assert 12 <= expression.shape[1] <= 24
    assert set(samples["condition"]) == {"control", "treated"}
    assert list(samples["sample_id"]) == list(expression.columns)


def test_condition_cannot_be_read_off_the_column_order(committed):
    # The point Module 11 makes about keeping metadata separate: if the first
    # six columns were the controls, nobody would ever need the sample table.
    _, samples, _ = committed
    first_half = samples["condition"].iloc[: len(samples) // 2]
    assert first_half.nunique() == 2


# -------------------------------------------------------------- the grading


def _significant(results: pd.DataFrame, p_column: str = "p_adj") -> set[str]:
    hits = (results[p_column] < GEN.ALPHA) & (results["effect"].abs() >= GEN.MIN_EFFECT)
    return set(results.index[hits])


def _pipeline(
    expression: pd.DataFrame,
    samples: pd.DataFrame,
    *,
    filter_low: bool = True,
    normalise: bool = True,
    equal_var: bool = False,
    correction: str = "bh",
) -> pd.DataFrame:
    """The reference analysis with each step switchable, to model mistakes."""
    from scipy import stats

    kept = (
        expression[expression.mean(axis=1) >= GEN.LOW_SIGNAL_THRESHOLD]
        if filter_low
        else expression
    )
    data = kept - kept.median() if normalise else kept
    control = samples.loc[samples["condition"] == "control", "sample_id"]
    treated = samples.loc[samples["condition"] == "treated", "sample_id"]

    effect = data[treated].mean(axis=1) - data[control].mean(axis=1)
    p = stats.ttest_ind(
        data[treated], data[control], axis=1, equal_var=equal_var, nan_policy="omit"
    ).pvalue
    p = np.asarray(p, dtype=float)
    results = pd.DataFrame({"effect": effect, "p": p}, index=data.index)
    if correction == "bh":
        results["p_adj"] = GEN.benjamini_hochberg(p)
    elif correction == "bonferroni":
        results["p_adj"] = np.minimum(p * len(p), 1.0)
    else:
        results["p_adj"] = p
    return results


def within_tolerance(found: set[str], truth: set[str]) -> bool:
    """The capstone's documented tolerance for its quantitative deliverable.

    At least 18 of the 20 truly shifted features found, and at most 2 features
    reported that were not shifted. Mirrors the check in the Module 16 exercise;
    kept in one function here so the tolerance is stated once and the test below
    can show what it accepts and rejects.
    """
    return len(found & truth) >= 18 and len(found - truth) <= 2


def test_the_reference_pipeline_recovers_the_truth_exactly(committed):
    expression, samples, truth = committed
    expected = set(truth.loc[truth["shifted"], "feature"])

    assert _significant(GEN.reference_pipeline(expression, samples)) == expected


@pytest.mark.parametrize(
    "variant",
    [
        {"equal_var": True},  # Student's t instead of Welch's: a defensible choice
        {"correction": "bonferroni"},  # stricter correction: also defensible
        {"normalise": False},  # skipping normalisation costs precision, not correctness
    ],
    ids=["student-t", "bonferroni", "unnormalised"],
)
def test_the_tolerance_accepts_defensible_variations(committed, variant):
    # A tolerance that only the reference solution passes is not a tolerance:
    # a learner who makes a reasonable, different choice has not done it wrong.
    expression, samples, truth = committed
    found = _significant(_pipeline(expression, samples, **variant))
    assert within_tolerance(found, set(truth.loc[truth["shifted"], "feature"]))


def test_the_tolerance_rejects_skipping_the_multiple_testing_correction(committed):
    # The central idea of Module 14. With the effect-size threshold also in play
    # a missing correction can hide, so this uses the p-value alone — which is
    # how the capstone's "adjusts for multiple testing" check sees it.
    expression, samples, truth = committed
    expected = set(truth.loc[truth["shifted"], "feature"])

    uncorrected = _pipeline(expression, samples, correction="none")
    found = set(uncorrected.index[uncorrected["p_adj"] < GEN.ALPHA])

    assert len(found - expected) > 2, (
        "skipping the correction no longer produces false positives on this "
        "dataset, so the capstone cannot tell whether a learner applied one"
    )


def test_the_tolerance_rejects_comparing_the_wrong_groups(committed):
    # Reading condition off column order instead of the sample table — the
    # mistake the interleaved sample order exists to catch.
    expression, samples, truth = committed
    wrong = samples.copy()
    wrong["condition"] = ["control"] * 6 + ["treated"] * 6
    found = _significant(_pipeline(expression, wrong))

    assert not within_tolerance(found, set(truth.loc[truth["shifted"], "feature"]))
