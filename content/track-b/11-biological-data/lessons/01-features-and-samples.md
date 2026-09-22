---
slug: features-and-samples
position: 1
title: What is being measured, and in what
worked_example_code: |
  with open("expression.csv", "w") as f:
      f.write("feature,S01,S02,S03,S04\n")
      f.write("gene_001,6.92,7.61,6.30,7.12\n")
      f.write("gene_003,11.89,11.24,11.68,10.85\n")

  with open("expression.csv") as f:
      header = f.readline().strip()
      first_row = f.readline().strip()

  print("columns:", header)
  print("one row:", first_row)
worked_example_note: >-
  The program writes a tiny table and reads back its first two lines — nothing
  new since the files module. What is new is how to read what came out: the first
  line names the samples, and every line after it is one feature measured across
  all of them.
---

This track teaches statistics through biological data, not biology through
statistics. You need four words and one layout, and this lesson is all of them.

## Four words

**Feature** — one thing that was measured. In this track a feature is a gene, and
the number is how active that gene was: roughly, how much of it was being used.
You do not need to know what any particular gene does. `gene_001` is a name, like
a column heading in a spreadsheet.

**Sample** — one specimen that was measured. A sample of tissue, a dish of cells.
Every feature is measured in every sample.

**Condition** — the thing the experiment changed. Here there are two: `control`,
left alone, and `treated`, given something. The whole point of the experiment is
to ask which features differ between the two.

**Replicate** — one of several samples given the same condition. There are six
control samples and six treated. Why six rather than one is the subject of the
next lesson, and it is the most important idea in the track.

## The layout

The measurements come as a table with **one row per feature and one column per
sample**:

```
feature,S01,S02,S03,S04, ...
gene_001,6.92,7.61,6.30,7.12, ...
gene_002,4.65,4.69,,, ...
```

Two hundred rows, twelve columns. This orientation is a convention — you will
meet data laid out the other way round — but it matters that you pick one and
keep it. Every tool you use later asks "along which direction?", and the answer is
only obvious if the layout never changes under you.

## The second table

Notice what the columns do not tell you: whether `S01` was a control or treated.

That lives in a separate, much smaller table:

```
sample_id,condition,replicate
S01,treated,1
S02,control,1
S03,control,2
```

This separation is deliberate, and worth defending. Facts _about samples_ — which
condition, which replicate, which day it was processed — go in one place, with one
row per sample. Measurements go in the other. Encoding the condition in the sample
name (`ctrl_1`, `trt_1`) seems simpler until the day you need a second fact about
each sample and have nowhere to put it.

It also means you must _look it up_ rather than assume. The samples in this
dataset are not "six controls then six treated": they are interleaved, as they
often are in a real experiment. Anyone who takes the first six columns as controls
will get every later result wrong, and nothing will warn them.

## What the numbers mean

The values are on a **log2 scale**, which is how this kind of data is usually
handed to an analyst. You need exactly one fact about it:

> **A difference of 1 means twice as much.** A difference of 2 means four times.
> A difference of −1 means half.

So a gene at 9 in one sample and 10 in another was twice as active in the second.
That is why later modules can measure an effect as a simple difference of
averages — the logarithm has already turned "times as much" into "plus".
