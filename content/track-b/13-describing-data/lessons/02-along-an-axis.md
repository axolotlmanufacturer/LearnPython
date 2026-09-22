---
slug: along-an-axis
position: 2
title: Per feature, per sample, per condition
worked_example_packages: [pandas]
worked_example_code: |
  import pandas as pd

  expression = pd.DataFrame(
      {"S01": [7.0, 4.5, 11.9], "S02": [7.6, 4.7, 11.2], "S03": [6.3, None, 11.7]},
      index=["gene_001", "gene_002", "gene_003"],
  )
  samples = pd.DataFrame(
      {"sample_id": ["S01", "S02", "S03"], "condition": ["treated", "control", "control"]}
  )

  print("per sample: ", expression.mean(axis=0).round(2).tolist())
  print("per feature:", expression.mean(axis=1).round(2).tolist())

  control = samples.loc[samples["condition"] == "control", "sample_id"]
  print("control samples:", list(control))
  print("control mean per feature:", expression[control].mean(axis=1).round(2).tolist())

  bright = expression[expression.mean(axis=1) >= 6.0]
  print("kept:", list(bright.index))
worked_example_note: >-
  Four ideas in one example, each a single line. The axis picks the direction; a
  list of sample names picks the columns; the sample table supplies that list;
  and a True/False column inside square brackets picks the rows.
---

Your functions from the last lesson work on one list. The dataset is 200 lists.
pandas applies the same statistics to every row or every column at once — you
only have to say which.

## The axis

```python
expression.mean(axis=0)   # down each column: one answer per sample
expression.mean(axis=1)   # across each row:  one answer per feature
```

`.std()` and `.var()` take the same argument, and compute the _sample_ versions
— dividing by n − 1, like the ones you wrote.

With rows-as-features, `axis=1` means "for each feature". Getting this backwards
does not raise an error; it silently hands you twelve numbers where you wanted two
hundred, or the reverse. When a result has a surprising length, the axis is the
first thing to check.

## One condition's samples

To average a feature over the control samples only, you need the control
samples' _names_ — and those live in the sample table:

```python
control = samples.loc[samples["condition"] == "control", "sample_id"]
expression[control].mean(axis=1)
```

The first line reads: rows of the sample table where the condition is control,
column `sample_id`. That gives a list of names. Putting a list of names in square
brackets after the expression table selects those columns.

This is the moment the separate sample table pays for itself. Nothing in the
expression table says which columns are controls, and in this dataset they are
not the first six.

## Keeping only what you can measure

Module 12 found that the gaps pile up in features near the detection limit.
Those features are too faint to compare reliably, gaps or not, so the standard
move is to drop them — **with a threshold you state**:

```python
bright = expression[expression.mean(axis=1) >= 6.0]
```

Read the inside first. `expression.mean(axis=1) >= 6.0` is a True/False value
per feature. Putting it inside `expression[...]` keeps the rows where it was
True. That is a **boolean mask**, and it is the single most used pattern in
pandas.

On this dataset the threshold of 6.0 keeps 160 of the 200 features, and every
remaining value is present — the gaps were all in the faint features. That is not
luck; it is what the detection limit predicts. But check it rather than assume
it: `bright.isna().sum().sum()` should be 0.

A feature that is never detected has a mean of `NaN`, and `NaN >= 6.0` is False,
so it is dropped too. Comparisons with `NaN` are always False — worth knowing,
because it is the kind of rule that is convenient here and surprising elsewhere.
