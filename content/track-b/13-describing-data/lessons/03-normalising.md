---
slug: normalising
position: 3
title: Taking the instrument out of the numbers
worked_example_packages: [pandas]
worked_example_code: |
  import pandas as pd

  expression = pd.DataFrame(
      {"S01": [7.0, 9.0, 11.0], "S02": [7.5, 9.5, 11.5], "S03": [6.8, 8.8, 10.8]},
      index=["gene_a", "gene_b", "gene_c"],
  )
  print("medians before:", expression.median().tolist())

  by_hand = expression.copy()
  for sample in by_hand.columns:
      by_hand[sample] = by_hand[sample] - by_hand[sample].median()

  vectorised = expression - expression.median()

  print("medians after: ", vectorised.median().tolist())
  print("same result:   ", by_hand.equals(vectorised))
  print(vectorised)
worked_example_note: >-
  S02 reads half a unit high on every feature, and S03 a little low — the same
  shape, shifted. Subtracting each sample's median lines them up. The loop and
  the one-liner do exactly the same arithmetic, and the last line but one proves
  it rather than asking you to take it on trust.
---

Module 11 described technical variability: one sample processed on a different
afternoon reads a little high across the board. In the filtered dataset you can
see it directly — the samples' medians run from 9.12 to 9.93. On this scale that
is almost a doubling of overall signal between two samples that should, for most
features, be the same.

If you compare conditions without dealing with that, any sample that happens to
read hot pulls every feature in its condition upwards. **Normalising** removes the
part of each sample's numbers that belongs to the sample rather than to any
particular feature.

## Median-centring

The simplest version: subtract each sample's median from every value in that
sample. Afterwards every sample's median is 0, and a feature's value means "how far
above or below this sample's typical feature".

Differences _between_ features within a sample are untouched, and — the important
part — so is the difference between conditions for any one feature, apart from the
technical offset that is being removed.

## By hand, then vectorised

```python
for sample in normalised.columns:
    normalised[sample] = normalised[sample] - normalised[sample].median()
```

One sample at a time: work out its median, subtract it. Every step is visible,
and you could check any one of them with a calculator.

```python
normalised = expression - expression.median()
```

The same thing in one line. `expression.median()` is one number per sample, and
subtracting it from the table lines each number up with its column and subtracts
it from every value in that column. pandas calls this **vectorised** — the loop
still happens, but inside pandas, in compiled code.

Prefer the one-liner in practice: it is faster, and it is shorter, so there is
less of it to get wrong. But the loop was not wasted. It is what makes the
one-liner _readable_ rather than magic — you know what it does because you have
done it by hand, and you can prove the two agree, which is what the worked
example's `equals` line is for.

## What this step assumes

Every normalisation assumes something, and this one assumes that **most features
did not change between conditions, and the ones that did are balanced** — roughly
as many up as down around the middle.

If that is false — say the treatment raised a large fraction of features — then
the treated samples' medians really are higher for biological reasons, and
subtracting them erases the very effect you were looking for. Worse, if the real
changes are lopsided, they drag the medians, and centring on those medians plants
a false difference in every feature that did _not_ change.

This dataset was generated to satisfy the assumption (its generator documents
how, and why). Real data does not promise to. Normalisation is a modelling choice,
and like every modelling choice it should be stated alongside the result.
