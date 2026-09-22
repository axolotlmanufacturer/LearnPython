---
slug: could-it-be-chance
position: 1
title: Could this have happened by chance?
worked_example_code: |
  import random

  # gene_034, normalised (Module 13), in the six control and six treated samples.
  control = [0.81, -0.07, 0.58, -0.25, 0.49, 0.90]
  treated = [0.75, 1.75, 0.69, 0.79, 0.98, 1.47]

  def mean(values):
      return sum(values) / len(values)

  observed = mean(treated) - mean(control)
  print("observed difference:", round(observed, 2))

  everything = control + treated
  random.seed(0)
  at_least_as_big = 0
  trials = 2000
  for _ in range(trials):
      random.shuffle(everything)
      shuffled = mean(everything[6:]) - mean(everything[:6])
      if abs(shuffled) >= abs(observed):
          at_least_as_big += 1

  print("p:", at_least_as_big / trials)
worked_example_note: >-
  Nothing here but loops and arithmetic from Track A. If the condition labels
  meant nothing, shuffling them should produce differences as large as the real
  one quite often. Do it two thousand times and count how often it does. That
  proportion is a p-value — computed, not looked up.
---

Module 13 ended with every feature normalised and every condition's samples
identified. Now the question the experiment exists to ask, for one feature at a
time: _did the treatment change it?_

`gene_034`'s treated samples average 0.66 higher than its controls. On this scale
that is about one and a half times as much. Two explanations:

1. The treatment changed `gene_034`.
2. It did nothing, and this is the sort of gap you get anyway when you split twelve
   varying measurements into two groups of six.

## The null hypothesis

Explanation 2 has a name: the **null hypothesis** — "this feature does not differ
between conditions". You never prove it. What you can do is ask how often it
would produce a difference as large as the one you saw. If the answer is "hardly
ever", the null hypothesis becomes hard to believe.

## Shuffling

If the labels meant nothing, any sample could equally have been a control or a
treated one. So: pool all twelve values, shuffle, deal six into each group, note
the difference. Do that two thousand times and you have a picture of what "nothing
going on" actually looks like for this feature — and you can ask what fraction of
those random differences were at least as large as the real one.

That fraction is a **p-value**. The worked example computes one in fifteen lines,
with no statistics library at all. Run it a few times with different seeds and
watch it wobble a little around 0.03.

## What a p-value means

> **The probability of seeing a difference at least this large, if the null
> hypothesis were true.**

Read it twice: the order of the "if" is everything. And now the four things it
does **not** mean — each one a mistake found in published research:

- **Not** the probability that the null hypothesis is true. p is calculated by
  _assuming_ it is true, so it cannot also tell you how likely that assumption is.
- **Not** the probability that the result is a fluke.
- **Not** a measure of size. A tiny p can come from a trivial difference if there
  is enough data.
- **Not** a verdict. p = 0.049 and p = 0.051 are the same evidence. The 0.05
  threshold is a convention with no mathematical standing, and treating it as the
  boundary between true and false is the most damaging habit in applied
  statistics.

## Effect size, always

Report the difference itself next to the p-value. "Treated averaged 0.66 higher
(p = 0.03)" is a sentence a reader can weigh. "The difference was significant" is
not — significant of what, and how much? The p-value answers "did we see
something"; the effect size answers "was it worth seeing". Only the second is
about the biology.
