---
slug: summarising-with-pandas
position: 2
title: Letting pandas do it, and checking that it did
worked_example_code: |
  import pandas as pd

  samples = pd.DataFrame({
      "treatment": ["control"] * 6 + ["treated"] * 6,
      "mass_g": [16.2, 21.4, 15.8, 19.9, 17.1, 20.1,
                 24.3, 19.8, 26.1, 22.4, 25.5, 20.2],
  })

  print(samples["mass_g"].describe().round(2))
  print()
  print(samples.groupby("treatment")["mass_g"].agg(["count", "mean", "std"]).round(2))
worked_example_note: >-
  The table is built in code here rather than read from a file, so you can see
  exactly what went in. `describe()` gives the five-number summary plus count,
  mean and standard deviation in one call; `groupby` then splits the same column
  by treatment. That second shape is where almost every comparison in the rest of
  this track begins.
---

You have now computed a mean and a standard deviation from their definitions. You
will not do that again — pandas has them — but you needed to once, because a
number you cannot sanity-check is a number that can be wrong without you
noticing.

## Everything at once

```python
print(samples["mass_g"].describe().round(2))
```

```
count    12.00
mean     20.73
std       3.41
min      15.80
25%      19.12
50%      20.15
75%      22.88
max      26.10
```

Read it top to bottom:

- **count** — how many non-missing values. Compare it against the number of rows.
  If it is lower you have gaps, and now you know before you have drawn a
  conclusion from them.
- **mean** and **std** — as you computed by hand. `std` uses the `n - 1` divisor,
  so it will differ slightly from a by-hand version that divides by `n`.
- **min**, **25%**, **50%**, **75%**, **max** — the five-number summary. `50%` is
  the median.

Two habits worth forming. Compare `mean` against `50%`: here they are 20.73 and
20.15, close enough that neither tail is dragging much. And compare `count`
against `len(samples)`.

Without `.round(2)` you get numbers to six decimal places, which implies a
precision the measurements do not have.

## Splitting by group

Most real questions are comparisons. Did the treated samples differ from the
untreated ones? Are the northern sites colder?

```python
samples.groupby("treatment")["mass_g"].agg(["count", "mean", "std"]).round(2)
```

Read left to right: take the table, split the rows into groups by the value in
`treatment`, then from each group take `mass_g` and compute these statistics.

```
           count   mean   std
treatment
control        6  18.42  2.34
treated        6  23.05  2.68
```

Always ask for `count` alongside. A mean over six samples and a mean over six
hundred look identical in a table and mean very different things.

If you only want one statistic, you can skip `agg`:

```python
samples.groupby("treatment")["mass_g"].mean().round(2)
```

## The thing this table does not tell you

The treated mean is 4.63 higher than the control mean. It is extremely tempting
to stop here and say the treatment worked.

Look at the standard deviations: about 2.3 and 2.7. Then look at the raw values —
the control group reaches 21.4 and the treated group drops to 19.8. The groups
overlap. A gap of 4.63 between two groups that each spread over a couple of
units, with six samples apiece, is more than nothing but it is not obviously more
than you would get by splitting one unchanged group in half at random.

Might be real. Might be noise. **This table cannot tell you which**, and no amount
of staring at it will help. That question — how surprised should I be by a
difference this size — is what the next module is about.

For now the discipline is: report the group means with their counts and spreads,
and do not use the word "effect" yet.
