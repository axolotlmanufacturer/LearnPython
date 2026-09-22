---
slug: many-tests-at-once
position: 3
title: Many tests at once
worked_example_packages: [numpy, scipy]
worked_example_code: |
  import numpy as np
  from scipy import stats

  rng = np.random.default_rng(0)

  # 1000 features of pure noise: nothing differs between the conditions.
  control = rng.normal(size=(1000, 6))
  treated = rng.normal(size=(1000, 6))

  p = stats.ttest_ind(treated, control, axis=1, equal_var=False).pvalue

  print("features 'significant' at 0.05:", (p < 0.05).sum())
  print("after Bonferroni:", (p * len(p) < 0.05).sum())
worked_example_note: >-
  A thousand features in which, by construction, nothing happened. Roughly one in
  twenty of them comes out below 0.05 anyway — 62 on this run, against the 50 the
  definition of a p-value promises on average. Multiply each p by the number of
  tests, and every one of them vanishes.
---

The previous lesson ended on a false positive. It was not bad luck. It was
arithmetic.

## The problem

A p-value of 0.05 means that, when nothing is going on, a difference this large
turns up 5% of the time. Test **one** feature and a 5% risk of being fooled is a
reasonable bet. Test **160** and you should expect about eight of the unchanged
ones to come out "significant" purely by chance — every time, in every experiment.

The worked example makes this concrete: a thousand features of pure noise, and 62
"discoveries".

On this track's dataset, 26 features have p below 0.05. Because the data is
synthetic we can check them against the truth — and **six of the 26 are
nothing**. `gene_034` is one. An analysis that reported all 26 would be wrong
about nearly a quarter of its findings, and would have no way of knowing which.

This is the central problem in analysing biological data, not a footnote to it.
Real experiments measure thousands of features at a time.

## Bonferroni: control the chance of any mistake

The bluntest fix: with `n` tests, multiply every p-value by `n` (capping at 1),
then compare with 0.05 as usual.

```python
adjusted = [min(p * n, 1.0) for p in pvalues]
```

This guarantees that the chance of even **one** false positive, across all the
tests, stays under 5%. On this dataset it keeps 20 features — and none of them is
false.

The cost is strictness. With thousands of features, Bonferroni demands such tiny
p-values that real but modest effects get thrown away with the noise.

## Benjamini–Hochberg: control the proportion of mistakes

A different promise: among the features you report, **at most 5% should be
false**. That is usually the promise a biologist actually wants — a list worth
following up, with a known rate of dead ends.

The procedure, for `n` p-values:

1. Sort them from smallest to largest, keeping track of which feature each
   belongs to.
2. Multiply the p-value at rank `k` (1 = smallest) by `n / k`.
3. Working back from the largest rank to the smallest, replace each value by the
   smallest value at its rank or above. This keeps the adjusted values in the same
   order as the originals.
4. Cap at 1, and put them back in the original order.

Step 3 is the fiddly one, and the reason is worth seeing: without it, a smaller
p-value could end up with a _larger_ adjusted value than a bigger one, which would
make no sense.

On this dataset Benjamini–Hochberg keeps 22 features, two of them false: 2 out of
22 is about 9%, a little over the 5% target on this particular draw, and far
better than 6 out of 26.

## Neither is "the right answer"

Bonferroni: fewer findings, almost never wrong. Benjamini–Hochberg: more findings,
a controlled fraction wrong. Which you want depends on what happens next — an
expensive follow-up experiment per finding argues for strictness; a screen whose
results will be checked anyway argues for the latter. What is never acceptable is
to test hundreds of features and report the raw p-values as if you had tested one.
