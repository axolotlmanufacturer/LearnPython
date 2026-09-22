---
slug: missing-values
position: 3
title: Gaps, and why they are there
worked_example_packages: [pandas]
worked_example_code: |
  import pandas as pd

  with open("expression.csv", "w") as f:
      f.write("feature,S01,S02,S03,S04\n")
      f.write("gene_001,6.92,7.61,6.30,7.12\n")
      f.write("gene_002,4.65,4.69,,\n")
      f.write("gene_010,,,,\n")

  expression = pd.read_csv("expression.csv", index_col="feature")

  print(expression)
  print()
  print("gaps per feature:")
  print(expression.isna().sum(axis=1))
  print()
  print("never detected:", list(expression.index[expression.isna().all(axis=1)]))
worked_example_note: >-
  pandas shows a gap as NaN. isna() turns the table into True/False — True where
  a value is missing — and sum(axis=1) counts the Trues along each row. The last
  line asks a sharper question: which features were not detected in any sample
  at all?
---

The dataset has 315 empty cells. They are not mistakes, and understanding why
they are there tells you what to do about them.

## Why measurements go missing

An instrument cannot measure arbitrarily small amounts. Below some level — the
**detection limit** — it cannot tell a faint signal from nothing, and records
nothing. So a gap here does not mean "somebody forgot". It means **"too low to
measure"**, which is information: this feature was barely present in that sample.

That has a consequence worth noticing before you do anything else. The gaps are
not scattered at random. They pile up in features that are _low everywhere_,
because those are the ones hovering near the limit. A feature at 11 is never
going to dip below 4 by chance.

Some features are never detected at all. In this dataset fifteen of them have no
value in any of the twelve samples.

## NaN

pandas marks a gap as `NaN` — "not a number". It behaves like `None` did in the
first lesson, with one difference that catches people out: **most pandas
calculations skip it silently.** `expression.mean()` averages the values that are
there and ignores the gaps. Convenient, and dangerous — a mean of two detected
values and a mean of twelve look identical in the output.

## Counting gaps

```python
expression.isna()                  # True where missing, a table the same shape
expression.isna().sum()            # gaps per column (per sample)
expression.isna().sum(axis=1)      # gaps per row (per feature)
expression.isna().any(axis=1)      # does each feature have any gap?
expression.isna().all(axis=1)      # is each feature missing everywhere?
```

`sum()` counts Trues because True counts as 1. The `axis` argument chooses the
direction: `axis=0`, the default, works down each column; `axis=1` works across
each row. With rows-as-features, **`axis=1` means "for each feature"** — the
direction you will want most of the time from here on.

## What not to do yet

It is tempting to fill the gaps with 0 and move on. Don't: on this scale 0 is a
real, very low measurement, and a filled-in 0 drags every average towards it.

It is also tempting to drop every feature with a gap. That turns out to be close
to right for this data, but for a better reason than "gaps are inconvenient" —
features near the detection limit are too faint to compare reliably anyway.
Module 13 does exactly that, deliberately, with a stated threshold.

For now, the job is only to **count and report**. A gap you have counted is
information. A gap you have hidden is a flaw in every result built on top of it.
