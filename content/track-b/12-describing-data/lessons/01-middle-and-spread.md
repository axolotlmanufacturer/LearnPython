---
slug: middle-and-spread
position: 1
title: The middle, and how wrong it can be
worked_example_code: |
  values = [2, 3, 3, 4, 88]

  mean = sum(values) / len(values)
  ordered = sorted(values)
  median = ordered[len(ordered) // 2]

  print("mean:  ", mean)
  print("median:", median)
worked_example_note: >-
  Plain Python, no libraries. The mean is 20 and the median is 3, and no value in
  the list is anywhere near 20. That gap is the whole subject of this lesson.
---

You have a column of numbers. The first thing anyone asks is "what is the typical
value". There is more than one answer, and choosing badly is one of the easiest
ways to mislead people — including yourself.

## The mean

Add everything up, divide by how many:

```python
mean = sum(values) / len(values)
```

The mean uses every value, which is its strength and its weakness. Every value
gets a vote, including the one that is a typo.

## The median

Sort the values and take the middle one. With an even count, take the mean of the
middle two.

The median does not care how extreme the extremes are — only how many are on each
side. Move the largest value from 88 to 8,800 and the median does not budge.

## Why this matters more than it sounds

`[2, 3, 3, 4, 88]` has a mean of 20. Four of the five values are below 5.
Reporting "the average is 20" is technically true and communicates something
false.

That 88 is either:

- **an error** — a misplaced decimal point, a sensor spike, a value in the wrong
  unit. Find out and fix it.
- **real and interesting** — the thing you should actually be studying.

Either way, the mean has hidden it and the median has ignored it. Only looking at
the numbers finds it. This is why the previous module insisted you look at the
data before computing anything.

A rough rule: **when the mean and median are far apart, something is pulling on
the tail.** Report both, and go and find out what.

## Spread

Two sets of numbers can share a mean and have nothing else in common:

```
[49, 50, 51]        mean 50
[0, 50, 100]        mean 50
```

A middle with no spread beside it is close to meaningless. The standard measure
is the **standard deviation** — roughly, the typical distance from the mean.

Its definition, in order:

1. Subtract the mean from each value. These are the deviations.
2. Square each one, so that above and below both count as distance rather than
   cancelling out.
3. Average the squares. This is the **variance**.
4. Take the square root, to get back to the original units.

```python
mean = sum(values) / len(values)
squared = [(v - mean) ** 2 for v in values]
variance = sum(squared) / len(squared)
sd = variance ** 0.5
```

Step 4 is what makes it readable: variance is in squared units — squared degrees,
squared grams — which means nothing to anybody. The standard deviation is in
degrees.

> **A wrinkle you will meet.** Some tools divide by `len(values)` in step 3 and
> some by `len(values) - 1`. The first describes the numbers you have; the second
> estimates the spread of a larger population you sampled from. pandas uses
> `n - 1` by default and plain Python does not, so the two disagree slightly on
> small samples. It is not a bug in either. Just know which you asked for.

## The five-number summary

Rather than one number, five:

- the **minimum** and **maximum**
- the **median**
- the **first quartile** — a quarter of the values are below it
- the **third quartile** — three quarters are below it

The gap between the first and third quartiles holds the middle half of the data
and is called the interquartile range. Together these five describe the shape of
a distribution well enough that you can usually tell whether a mean would have
been honest.
