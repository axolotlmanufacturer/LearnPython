---
slug: why-measurements-vary
position: 2
title: The same thing, measured twice
worked_example_code: |
  # gene_001 in the six control samples, and in the six treated ones.
  control = [7.61, 6.30, 7.68, 7.78, 7.08, 6.41]
  treated = [6.92, 7.12, 7.54, 6.92, 7.34, 7.72]

  print("control ranges from", min(control), "to", max(control))
  print("treated ranges from", min(treated), "to", max(treated))
  print("control average:", round(sum(control) / len(control), 2))
  print("treated average:", round(sum(treated) / len(treated), 2))
worked_example_note: >-
  Six samples given exactly the same treatment, and they span nearly one and a
  half units — close to a threefold difference on this scale. The two averages
  differ by about a tenth. Whatever that tenth is, it is much smaller than the
  disagreement between samples that were supposed to be identical.
---

Look at the worked example's first two lines before anything else. Six control
samples, handled the same way, and `gene_001` comes out anywhere from 6.30 to
7.78. Nobody made a mistake. This is what biological measurement looks like.

## Two sources of variation

**Biological variability.** Two dishes of cells, grown the same way, are still two
different living things. One is a little further along, one a little more
stressed. Their genes are genuinely not doing identical amounts of work.

**Technical variability.** The measuring is imperfect. One sample is processed on
a slightly different afternoon; one run of the instrument reads a little hot
across the board. This part is not about the biology at all — and some of it
affects every feature in a sample by the same amount, which is what lets you
remove it later.

You cannot see which is which in a single number. You can only see that they add
up to spread.

## Why this is the whole track

Suppose the treated average came out higher than the control average. Is that
because the treatment did something — or because replicates always disagree, and
these happened to land that way round?

That question is what statistics is _for_. Every method in the rest of this track
is a way of asking how big a difference has to be, compared with the spread
between replicates, before you should believe it:

- **Module 13** measures the spread.
- **Module 14** asks whether a difference is bigger than the spread explains.
- **Module 15** draws it, so you can see both at once.

And it is why there are six replicates rather than one. With one control and one
treated sample, you would have a difference and no idea whatsoever how much of it
was the treatment and how much was the ordinary disagreement between any two
samples. Replicates are how you measure the disagreement.

## One rule to carry forward

> **A difference is only interesting relative to the spread.**

`gene_001`'s conditions differ by 0.12. Its replicates disagree by up to 1.48. On
that evidence alone the difference means nothing — not "the treatment did
nothing", but "this experiment cannot tell". Those are different statements, and
the gap between them is where most misreadings of data begin.
