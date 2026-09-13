---
slug: the-t-test
position: 2
title: The t-test, and what it assumes
worked_example_code: |
  from scipy import stats

  control = [16.2, 21.4, 15.8, 19.9, 17.1, 20.1]
  treated = [24.3, 19.8, 26.1, 22.4, 25.5, 20.2]

  result = stats.ttest_ind(treated, control, equal_var=False)

  print("t:", round(result.statistic, 3))
  print("p:", round(result.pvalue, 4))
  print("difference in means:", round(sum(treated) / 6 - sum(control) / 6, 2))
worked_example_note: >-
  The same comparison as the previous lesson, in one call. Compare the p it gives
  — 0.0099 — against the 0.0135 your shuffling produced. Two different methods,
  the same conclusion. That agreement is the point of having done it by hand
  first.
---

Shuffling works, needs no formula, and makes the logic visible. But two thousand
iterations for every comparison adds up, and the answer wobbles slightly each
time you run it.

The **t-test** answers the same question with algebra instead of repetition.

## Running one

```python
from scipy import stats

result = stats.ttest_ind(treated, control, equal_var=False)
print(result.statistic, result.pvalue)
```

> **scipy is a large download** — considerably bigger than pandas. It arrives on
> your first Run in this lesson and is then reused. This is the point in the
> track where a formula genuinely earns its keep, which is why it has not
> appeared before now.

Two numbers come back:

- **the t statistic** — the difference between the means, measured in units of
  how noisy the data is. Bigger means the gap stands out more against the
  scatter. Its sign just says which group was larger.
- **the p-value** — exactly what you computed by shuffling, and it means exactly
  the same thing. Everything in the previous lesson about what a p-value is not
  applies here unchanged.

For our data: t = 3.19, p = 0.0099. Your shuffle gave 0.0135. Close, and they
would converge with more iterations. **Nothing new is being claimed** — this is a
faster route to the answer you already had.

## `equal_var=False`

The default `ttest_ind` assumes the two groups have the same underlying spread.
Passing `equal_var=False` drops that assumption and runs Welch's t-test instead.

Prefer Welch's. When the spreads really are equal it gives essentially the same
answer, and when they are not it stays correct while the default does not. There
is very little reason to take the risk for a benefit you cannot detect.

## What it assumes

Every statistical test has conditions, and a test applied outside them returns a
confident number that means nothing.

**Independent observations.** Each measurement is a separate thing. Measure the
same sample twice and you have one observation, not two — the test cannot tell,
and will treat your six readings as more evidence than they are. This is the
assumption most often violated and the hardest to spot from the data alone.

**Roughly symmetric data, or enough of it.** The t-test works on means, and means
are unreliable summaries of very skewed data. Six wildly skewed values will
mislead it. Look at the distribution first — which is what Module 12 was for.

**Two groups, one comparison.** For three groups, comparing every pair separately
is not a valid substitute. That is the subject of the next module, and it is a
bigger problem than it sounds.

## Which test, briefly

A map, not a syllabus — you will meet these properly later:

| Situation                    | Test                              |
| ---------------------------- | --------------------------------- |
| Two independent groups       | `ttest_ind(..., equal_var=False)` |
| Same subjects measured twice | `ttest_rel`                       |
| Very skewed data, or ranks   | `mannwhitneyu`                    |
| Counts in categories         | `chi2_contingency`                |

If you cannot say which row you are in, the honest move is to describe the data
and say so, rather than to reach for `ttest_ind` because it is the one you know.
A test chosen because it was familiar is worse than no test, because it comes
with a number that looks like an answer.
