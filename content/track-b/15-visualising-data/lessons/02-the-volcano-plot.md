---
slug: the-volcano-plot
position: 2
title: The volcano plot
worked_example_packages: [matplotlib]
worked_example_code: |
  import math
  import matplotlib.pyplot as plt

  # Six features from this track's results: effect and adjusted p-value.
  names = ["gene_023", "gene_140", "gene_004", "gene_105", "gene_034", "gene_001"]
  effect = [-2.62, 2.62, 0.36, 0.84, 0.66, 0.08]
  p_adj = [1.7e-06, 3.9e-06, 0.035, 0.04, 0.21, 0.94]

  height = [-math.log10(p) for p in p_adj]
  significant = [p < 0.05 and abs(e) >= 1 for e, p in zip(effect, p_adj)]
  colours = ["crimson" if s else "grey" for s in significant]

  plt.scatter(effect, height, c=colours)
  plt.axhline(-math.log10(0.05), linestyle="--", color="black")
  plt.axvline(-1, linestyle="--", color="black")
  plt.axvline(1, linestyle="--", color="black")
  plt.xlabel("effect: treated minus control (log2)")
  plt.ylabel("-log10 adjusted p-value")
  plt.title("Volcano plot")
  plt.show()
worked_example_note: >-
  Six features, one picture. Left and right is how much a feature changed; up is
  how sure you can be that it changed at all. The two red points clear both
  dashed lines. The two grey points just above the horizontal line are the
  interesting ones — the lesson below is mostly about them.
---

Module 14 produced, for every feature, two numbers: an effect size and an
adjusted p-value. A table of 160 of those is hard to take in. The **volcano plot**
puts them all on one picture.

## The axes

- **Horizontal: the effect.** Treated minus control, on the log2 scale. Right of
  zero, higher in treated; left, lower. A point at +1 doubled; at −1, halved.
- **Vertical: −log10 of the adjusted p-value.** The minus-log turns small p-values
  into tall points: p = 0.1 plots at 1, p = 0.01 at 2, p = 0.001 at 3. So **up
  means stronger evidence**.

Most features did not change, so most points pile up low and near the middle. The
few that changed a lot, with strong evidence, fly up and out to the sides — which
is the shape that gives the plot its name.

## Two thresholds, deliberately

The dashed lines are the design choice that makes the plot useful:

- The **horizontal** line sits at −log10(0.05), about 1.3. Points above it have an
  adjusted p-value below 0.05.
- The **vertical** lines sit at ±1. Points outside them changed by at least a
  factor of two.

Only points past **both** — up _and_ out — are highlighted. Each threshold alone
lets through something you do not want:

- Above the line but between the verticals: **confidently detected, but small.**
  In the worked example these are `gene_004` and `gene_105`. On this dataset they
  are also exactly the two false positives that Benjamini–Hochberg let through in
  Module 14 — not a coincidence, since with 160 tests some small, lucky differences
  are bound to clear the significance line.
- Outside the verticals but below the line: **large, but unconvincing** — a big
  difference in noisy data. (On this dataset there happen to be none.)

This is the p-value and effect-size lesson from Module 14, made visible. Neither
number on its own is a finding.

## Reading one

When you look at a volcano plot, ask in this order:

1. **How many points are highlighted, and on which side?** That is the headline:
   how many features went up, how many down.
2. **What sits just above the horizontal line, inside the verticals?** Probably
   real but probably small — and, with enough tests, some of it is chance.
3. **Is anything weird?** A wall of points at the very top usually means a
   p-value of exactly 0, which is a computing artefact, not infinite evidence. A
   lopsided cloud may mean normalisation went wrong.

The plot does not tell you what any gene does. It tells you which ones are worth a
biologist's time, and how much to trust the list.
