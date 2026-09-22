---
slug: distributions
position: 1
title: The shape of a sample, and one feature by condition
worked_example_packages: [matplotlib]
worked_example_code: |
  import matplotlib.pyplot as plt

  # gene_009, normalised, in its six control and six treated samples.
  control = [1.16, 0.54, 1.13, 0.32, 0.96, 1.28]
  treated = [-0.93, -0.52, -0.26, -0.81, -0.80, -0.77]

  plt.boxplot([control, treated])
  plt.xticks([1, 2], ["control", "treated"])
  plt.ylabel("gene_009, normalised (log2)")
  plt.title("gene_009 by condition")
  plt.show()
worked_example_note: >-
  One feature, two boxes. Each box spans the middle half of that condition's
  values, the line across it is the median, and the whiskers reach out towards
  the extremes. Here the two boxes do not come close to touching — which is what
  a real difference looks like.
---

Numbers answer the questions you thought to ask. A plot shows you the ones you
did not. This module is about producing three standard plots and — just as much —
reading them correctly.

> **The first Run in this module downloads matplotlib**, the plotting library. It
> is the largest download in the track; it is fetched once and reused after that.

## Drawing anything

```python
import matplotlib.pyplot as plt

plt.hist(values, bins=10)
plt.xlabel("normalised level (log2)")
plt.ylabel("number of features")
plt.title("Sample S01")
plt.show()
```

`import matplotlib.pyplot as plt` is as universal as `pd` for pandas. Every plot
is built the same way: draw something, label it, show it.

**Label every axis.** A plot without labels is a picture of numbers nobody can
check. The platform describes each of your plots in words for anyone using a
screen reader, built from the title and labels you give it — so an unlabelled
plot is also one that cannot be described. That is not a coincidence; the same
missing information hurts every reader.

## The histogram: the shape of one set of numbers

A histogram cuts the range of values into equal bins and draws a bar for how many
values fall in each. It answers questions a mean cannot: is there one peak or two?
Is it lopsided? Are there values far from the rest?

A histogram of one sample across its 160 features shows you what "typical" looks
like for that sample. Draw two samples on top of each other and a technical
offset — one sample reading hot — shows up as the whole shape sliding sideways.

## The boxplot: one feature, several groups

A boxplot summarises each group with five numbers you already know from Module 13:

- the **box** runs from the first quartile to the third — the middle half of the
  values;
- the **line inside it** is the median;
- the **whiskers** reach towards the smallest and largest values (points beyond
  them, if any, are drawn separately as possible outliers).

Put two conditions side by side and the question from Module 11 — is the
difference bigger than the spread? — becomes something you can see. Boxes that
overlap heavily: the conditions barely differ, whatever the averages say. Boxes
that do not touch: a difference much larger than the disagreement between
replicates.

It is not a substitute for the test. With six values per box, the picture is
suggestive and the p-value is the measurement. But it is the fastest way to catch
the test being misled — one wild value, a group with very different spread — before
you believe it.
