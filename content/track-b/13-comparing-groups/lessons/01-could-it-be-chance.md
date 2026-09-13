---
slug: could-it-be-chance
position: 1
title: Could this have happened by chance?
worked_example_code: |
  import random

  control = [16.2, 21.4, 15.8, 19.9, 17.1, 20.1]
  treated = [24.3, 19.8, 26.1, 22.4, 25.5, 20.2]

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
  Nothing here but loops and arithmetic you already know. The idea: if the labels
  meant nothing, we could shuffle them and get differences just as large. Do that
  two thousand times and count how often we do. That proportion is a p-value —
  computed, not looked up.
---

Last module ended with two group means, 18.42 and 23.05, and a warning not to
call the gap an effect yet. Here is why, and what to do instead.

## The question

The treated group averaged 4.63 higher. Two explanations:

1. The treatment did something.
2. It did nothing, and this is the sort of gap you get anyway when you split
   twelve varying measurements into two groups of six.

You cannot rule out (2). What you _can_ do is find out how often (2) would
produce a gap this big — and if the answer is "hardly ever", (2) becomes hard to
believe.

## Shuffling

Suppose the labels are meaningless. Then any sample could equally have been in
either group, and reassigning the labels at random should give differences of
much the same size as the one you saw.

So: pool all twelve values, shuffle, deal six into each group, and note the
difference. Do it a couple of thousand times. Now you have a picture of what
"nothing going on" actually looks like — and you can ask what fraction of those
random differences were at least as large as yours.

That fraction is a **p-value**. The worked example above computes one in fifteen
lines of ordinary Python, no statistics library involved. It is worth running a
few times with different seeds to see it wobble.

## What a p-value means

> **The probability of seeing a difference at least this large, if there were no
> real difference.**

Read that twice; the order of the conditional is everything.

Now the four things it does **not** mean. Each of these is a mistake in
published research, not a hypothetical:

- **Not** the probability that there is no real difference. p is computed
  _assuming_ no difference — it cannot also tell you the chance of that
  assumption being true.
- **Not** the probability your result is a fluke.
- **Not** a measure of size. A p-value of 0.001 does not mean a big effect. With
  enough samples, an utterly trivial difference produces a tiny p.
- **Not** a verdict. p = 0.049 and p = 0.051 are the same evidence. The 0.05
  threshold is a convention with no mathematical standing whatsoever, and
  treating it as a boundary between true and false is the single most damaging
  habit in applied statistics.

## Effect size

Always report the difference itself alongside the p-value. "The treated group
averaged 4.63 g higher (p = 0.01)" is a sentence a reader can evaluate.
"The difference was significant (p = 0.01)" is not — significant of what, and how
much?

A large study can find a difference of 0.02 g with p < 0.001. Both statements are
true and the finding is uninteresting. The p-value answers "did we see
something"; the effect size answers "was it worth seeing". You need both, and
only the second one is about the world.
