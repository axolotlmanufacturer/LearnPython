---
slug: the-t-test
position: 2
title: The t-test, and confirming it agrees
worked_example_packages: [scipy]
worked_example_code: |
  from scipy import stats

  control = [0.81, -0.07, 0.58, -0.25, 0.49, 0.90]
  treated = [0.75, 1.75, 0.69, 0.79, 0.98, 1.47]

  result = stats.ttest_ind(treated, control, equal_var=False)

  print("t:", round(result.statistic, 2))
  print("p:", round(result.pvalue, 4))
  print("the shuffle gave: 0.031")
worked_example_note: >-
  The same feature as the previous lesson, in one call. The shuffle said 0.031;
  the t-test says 0.0301. Two completely different routes to the same answer —
  which is the reason for having done it by hand first. The formula is not
  magic; it is a faster way to the number you already know how to get.
---

Shuffling works, needs no formula, and makes the logic visible. But two thousand
iterations for each of 160 features adds up, and the answer wobbles a little every
time you run it. The **t-test** answers the same question with algebra instead of
repetition.

> **scipy is a large download** — larger than pandas. It arrives on your first Run
> in this lesson and is then reused. This is the point where a formula genuinely
> earns its keep, which is why it has not appeared before now.

## Running one

```python
from scipy import stats

result = stats.ttest_ind(treated, control, equal_var=False)
print(result.statistic, result.pvalue)
```

Two numbers come back. The **t statistic** is the difference between the means
measured in units of how noisy the data is — the bigger it is, the more the gap
stands out from the scatter. The **p-value** is exactly what your shuffle
estimated, and everything in the last lesson about what it does not mean applies
unchanged.

For `gene_034`: p = 0.0301 from the formula, 0.031 from shuffling. **Nothing new
is being claimed** — this is a faster route to the answer you already had.

## `equal_var=False`

By default `ttest_ind` assumes both groups have the same underlying spread.
`equal_var=False` drops that assumption and runs Welch's t-test instead. When the
spreads really are equal the two give almost the same answer, and when they are
not, Welch's stays correct while the default does not. Prefer it.

## What it assumes

A test applied outside its conditions returns a confident number that means
nothing.

**Independent observations.** Each value comes from a separate sample. Measure the
same sample twice and you have one observation, not two — the test cannot tell,
and treats your data as more evidence than it is.

**Roughly symmetric data, or enough of it.** The t-test works on means, and means
mislead on very skewed data. That is part of why this track works on a log scale.

## Hold that thought

`gene_034` has p = 0.03. By the conventional threshold, it "differs between
conditions".

This dataset is synthetic, which means — unlike any real experiment — we know the
truth. `gene_034` is **not** one of the features the generator shifted. Nothing
changed it. It is a false positive, and the next lesson is about why an analysis
of 160 features is guaranteed to produce some.
