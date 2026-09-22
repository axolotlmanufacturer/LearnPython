---
slug: a-table-in-python
position: 2
title: The same table, with pandas
worked_example_packages: [pandas]
worked_example_code: |
  import pandas as pd

  with open("expression.csv", "w") as f:
      f.write("feature,S01,S02,S03\n")
      f.write("gene_001,6.92,7.61,6.30\n")
      f.write("gene_002,4.65,,4.69\n")
      f.write("gene_003,11.89,11.24,11.68\n")

  expression = pd.read_csv("expression.csv", index_col="feature")

  print(expression.shape)
  print(expression)
  print()
  print(expression.loc["gene_003", "S02"])
  print(expression.iloc[2, 1])
worked_example_note: >-
  The previous lesson's twelve lines, in one. index_col="feature" makes the
  feature names the row labels, so rows can be looked up by name. The last two
  lines fetch the same value two ways — by label, then by position — and the
  lesson below is mostly about why both exist.
---

`pandas` is a library for tables. Its table is a **DataFrame**, and
`pd.read_csv` builds one from a file: header row as column names, numbers
converted, empty cells marked as missing. Everything you did by hand in the last
lesson.

> **The first Run in this lesson is slow.** pandas is a large download that your
> browser fetches once and then keeps for the rest of the track.

## Loading, with the orientation you chose

```python
import pandas as pd

expression = pd.read_csv("expression.csv", index_col="feature")
```

`import pandas as pd` is a convention; nearly all pandas code you will ever read
says `pd`.

`index_col="feature"` matters more than it looks. Without it, pandas numbers the
rows 0, 1, 2 and treats `feature` as an ordinary column of text. With it, the
feature names _become_ the row labels — the table is rows-are-features in
pandas' own understanding, not just in yours.

## Three questions, every time

Before computing anything from a table you did not build yourself:

```python
print(expression.shape)          # (rows, columns)
print(list(expression.columns))  # the column names
print(expression.head())         # the first five rows
```

For this track's dataset that is `(200, 12)`, `S01` to `S12`, and five genes.
Ten seconds, and it is the difference between noticing the file has one column
fewer than you thought and discovering it three modules later.

`expression.describe()` goes further: count, mean, spread and quartiles — **for
each column**. Here the columns are samples, so `describe()` summarises each
sample across all its features. That is useful (Module 13 uses it to spot a
sample that reads high across the board) but notice it is not the per-feature
summary you might have expected. Every pandas operation has a direction, and
this is the first place it shows.

## Label or position

Two ways to pick out one value:

```python
expression.loc["gene_003", "S02"]   # by label: row named gene_003, column named S02
expression.iloc[2, 1]               # by position: third row, second column
```

In the worked example they return the same number, because `gene_003` happens to
be the third row and `S02` the second column. That is a coincidence of this file,
not a rule.

**Prefer `loc`.** It says what you mean. If the file is sorted differently next
time, or a row is filtered out, `loc["gene_003", "S02"]` still finds `gene_003`
and `iloc[2, 1]` silently finds whatever is now in third place. Use `iloc` when
position genuinely is the point — "the first five rows", "the last sample".

## When a name does not match

```python
expression["S1"]
```

raises `KeyError: 'S1'` — the same error a dictionary gives for a missing key,
for the same reason. The column is called `S01`. When you see a `KeyError` from
a DataFrame, print `list(expression.columns)` and compare character by
character; leading zeros, capital letters and trailing spaces are the usual
culprits, and all three are invisible until you look.
