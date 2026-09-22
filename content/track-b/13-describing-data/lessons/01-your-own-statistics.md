---
slug: your-own-statistics
position: 1
title: The middle and the spread, by hand
worked_example_code: |
  def mean(values):
      return sum(values) / len(values)

  def sample_variance(values):
      centre = mean(values)
      squared = [(value - centre) ** 2 for value in values]
      return sum(squared) / (len(values) - 1)

  def sample_stdev(values):
      return sample_variance(values) ** 0.5

  check = [2, 4, 4, 4, 5, 5, 7, 9]
  print("mean:    ", mean(check))
  print("variance:", round(sample_variance(check), 4))
  print("stdev:   ", round(sample_stdev(check), 4))
worked_example_note: >-
  Three short functions, and a list chosen so every step can be checked with a
  pencil: the mean is 5, the squared deviations add up to 32, and 32 divided by
  7 is the variance. Writing them yourself once is what stops the library
  versions from being magic.
---

Module 11 ended on a rule: a difference only means something relative to the
spread. This lesson builds the two numbers that rule needs — a middle and a
spread — as functions you write yourself.

## The middle

The **mean** adds everything up and divides by how many there are. Every value
gets a vote, which is its strength and its weakness: one wild value moves it.

The **median** sorts the values and takes the middle one. It does not care how
extreme the extremes are, only how many sit on each side.

`[2, 3, 3, 4, 88]` has a mean of 20 and a median of 3, and no value is anywhere
near 20. When the two are far apart, something is pulling on a tail — a
mis-typed value, or the most interesting thing in your data. Look before you
average.

## The spread

Two lists can share a mean and nothing else: `[49, 50, 51]` and `[0, 50, 100]`.
The standard measure of spread is the **standard deviation** — roughly, the
typical distance from the mean:

1. Subtract the mean from each value (the deviations).
2. Square each one, so above and below both count as distance instead of
   cancelling out.
3. Add them up and divide — this is the **variance**.
4. Take the square root, to get back into the original units.

## Why divide by n − 1

Step 3 divides by `len(values) - 1`, not `len(values)`. This is the one part that
is not obvious, and it is worth understanding rather than memorising.

You have six replicates, not every sample that could ever be grown. You want the
spread of _all_ of them, estimated from these six. But the deviations in step 1
are measured from the mean _of these six_ — which is, by construction, the point
closest to them. So the deviations come out a little smaller than they would from
the true, unknown mean, and dividing by `n` would systematically underestimate
the spread. Dividing by `n − 1` corrects for exactly that.

That is what "sample" in **sample variance** means, and it is what pandas and
scipy compute by default. Dividing by `n` — the population variance — describes
only the numbers in front of you. For `[2, 4, 4, 4, 5, 5, 7, 9]` the two standard
deviations are 2.138 and 2.0; with six replicates the difference is not small.

## Check your own work

A function you have not checked is a guess. Before trusting `sample_stdev` on 200
features, run it on a list small enough to work out by hand and compare. That
habit — a hand-checkable case first — is worth more than any particular formula
in this track.
