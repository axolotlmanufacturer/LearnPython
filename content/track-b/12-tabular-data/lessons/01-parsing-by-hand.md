---
slug: parsing-by-hand
position: 1
title: A table, by hand
worked_example_code: |
  with open("expression.csv", "w") as f:
      f.write("feature,S01,S02,S03\n")
      f.write("gene_001,6.92,7.61,6.30\n")
      f.write("gene_002,4.65,,4.69\n")

  table = {}
  with open("expression.csv") as f:
      samples = f.readline().strip().split(",")[1:]
      for line in f:
          name, *cells = line.strip().split(",")
          table[name] = [None if cell == "" else float(cell) for cell in cells]

  print(samples)
  print(table)
worked_example_note: >-
  Every piece of this is from Track A: files, split(), a dictionary, a list
  comprehension. The one new decision is on the line that builds each row — an
  empty cell becomes None, because float("") would stop the program and a blank
  is not zero.
---

Before pandas, do it by hand once. Not because you will keep doing it, but
because every question pandas later answers for you — what type is this, what
happens to an empty cell, which way round is the table — is a question you will
have answered yourself first.

## The shape to build

The file is lines of text. The goal is something you can look things up in:

```python
samples = ["S01", "S02", "S03"]
table = {
    "gene_001": [6.92, 7.61, 6.30],
    "gene_002": [4.65, None, 4.69],
}
```

A dictionary from feature name to that feature's values, in sample order, plus
the list of sample names so you know which value is which. `table["gene_001"][1]`
is `gene_001` in the second sample, `S02`.

## Three things split() will not do for you

**It gives you strings.** `"6.92,7.61".split(",")` is `["6.92", "7.61"]` — text
that looks like numbers. Nothing is converted until you call `float()`.

**The first column is different.** On every data line, the first cell is the
feature's name and the rest are measurements. `name, *cells = parts` takes the
first item into `name` and everything else into `cells`, which is exactly that
split.

**An empty cell is an empty string.** `"4.65,,4.69".split(",")` is
`["4.65", "", "4.69"]`. `float("")` raises a `ValueError`. So you have to decide,
right there, what a gap becomes.

## None, not zero

The worked example turns a gap into `None`. That is a deliberate choice, and the
alternative is a trap. On this scale 0 is a real measurement — a very low one —
so writing 0 for "not measured" would put a false value into every average you
compute from that row, and nothing afterwards would warn you.

`None` says "there is nothing here". Any arithmetic on it fails loudly, which is
what you want: the program stops at the point where you have to decide what a
missing value should mean, instead of quietly deciding for you.

pandas makes the same choice with a special value called `NaN`, which you will
meet in the last lesson of this module.
