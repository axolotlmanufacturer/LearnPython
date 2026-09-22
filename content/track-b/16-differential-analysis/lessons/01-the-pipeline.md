---
slug: the-pipeline
position: 1
title: The whole pipeline
worked_example_packages: [pandas, scipy]
worked_example_code: |
  # The shape of the pipeline — one function per stage — on a toy table of
  # seven features and six samples. Run it, then build the real one yourself.
  import pandas as pd
  from scipy import stats

  expression = pd.DataFrame(
      {"A1": [9.1, 5.0, 11.2, 8.0, 10.1, 9.6, 12.2], "A2": [9.3, 5.2, 11.0, 8.3, 9.9, 9.4, 11.9],
       "A3": [8.9, 4.8, 11.4, 8.1, 10.3, 9.7, 12.1], "B1": [7.2, 5.1, 11.1, 8.2, 10.0, 9.5, 12.0],
       "B2": [7.0, 4.9, 11.3, 7.9, 10.2, 9.8, 12.3], "B3": [7.4, 5.3, 10.9, 8.4, 10.1, 9.3, 11.8]},
      index=["gene_u", "gene_v", "gene_w", "gene_x", "gene_y", "gene_z", "gene_t"],
  )
  samples = pd.DataFrame(
      {"sample_id": ["A1", "A2", "A3", "B1", "B2", "B3"],
       "condition": ["control"] * 3 + ["treated"] * 3}
  )


  def prepare(expression, threshold):
      kept = expression[expression.mean(axis=1) >= threshold]
      return kept - kept.median()


  def compare(normalised, samples):
      control = samples.loc[samples["condition"] == "control", "sample_id"]
      treated = samples.loc[samples["condition"] == "treated", "sample_id"]
      effect = normalised[treated].mean(axis=1) - normalised[control].mean(axis=1)
      p = stats.ttest_ind(
          normalised[treated], normalised[control], axis=1, equal_var=False
      ).pvalue
      return pd.DataFrame({"effect": effect, "p": p})


  results = compare(prepare(expression, 6.0), samples)
  print(results.round(3))
worked_example_note: >-
  gene_v is dropped as too faint, gene_u is the one that changed, and the rest
  sit near zero. Your version adds what this sketch leaves out — your own test
  statistic, the multiple-testing correction, the thresholds, the plot and the
  words — on the real dataset.
---

This is the track in one piece. There are no new ideas in this module; there is
the new experience of deciding the order yourself, with nobody breaking the
problem into steps for you.

## The pipeline

Each stage is something you have already done in isolation:

| Stage                                                                      | From          |
| -------------------------------------------------------------------------- | ------------- |
| Load the measurements and the sample table; look at them                   | Module 12     |
| Report the gaps; drop features below a mean of 6.0                         | Modules 12–13 |
| Median-centre each sample                                                  | Module 13     |
| For every feature: effect size and Welch's t statistic — **your own**      | Modules 13–14 |
| Cross-check your statistic against `scipy.stats`; take p-values from scipy | Module 14     |
| Benjamini–Hochberg across all features                                     | Module 14     |
| Findings: adjusted p below 0.05 **and** an effect of at least 1            | Modules 14–15 |
| Volcano plot, highlighted                                                  | Module 15     |
| Two to four sentences on what it means                                     | All of it     |

Welch's t statistic, written out:

```
t = (mean_treated − mean_control) / sqrt(var_treated / n_treated + var_control / n_control)
```

with the **sample** variances from Module 13. It is the difference in means,
measured in units of how noisy that difference is — and it is exactly what scipy
computes, which is how you will know yours is right.

## Structure it

The worked example puts one stage in each function. Do the same. It is the
difference between a pipeline you can check a piece at a time and one that is a
single wall of code — and when a number looks wrong, it tells you which function
to look in.

## How this is graded

The data is synthetic, so the grader knows which 20 features were really shifted.
Your findings are compared against that list with a **stated tolerance**: you
pass if you find **at least 18 of the 20** and report **no more than 2** that were
not shifted.

The tolerance is there because reasonable choices differ. Student's t instead of
Welch's, Bonferroni instead of Benjamini–Hochberg, even skipping normalisation —
each moves the answer a little and still passes. Skipping the multiple-testing
correction does not, and neither does taking the first six columns as the
controls. Those are the two mistakes this whole track has been about.

The written interpretation is not auto-graded. It comes with a checklist; judge
your own sentences against it honestly, as you would want a colleague to.

## Three exercises, one pipeline

Each exercise below builds on the last. Nothing carries over between them
automatically — each starts fresh — so copy your code forward from the previous
exercise and extend it. By the third, you will have written the whole thing.
