---
slug: a-table-in-python
position: 1
title: A table in Python
worked_example_code: |
  import pandas as pd

  readings = pd.read_csv("readings.csv")

  print(readings.shape)
  print(list(readings.columns))
  print(readings.head(3))
worked_example_note: >-
  Three questions, asked in the order you should always ask them: how big is
  this, what is in it, and what does it actually look like. `shape` is
  `(rows, columns)`. Notice that you never wrote a loop — that is the point of
  this module.
---

You already know how to read a file line by line and split it on commas. You
could analyse a table that way, and for twenty rows you probably should. For
twenty thousand it becomes a lot of bookkeeping, and every one of those loops is
somewhere to make a mistake.

`pandas` is a library for tables. It gives you one object — a **DataFrame** —
that holds the whole table, and lets you say what you want done to a column
rather than to each value in turn.

> **The first Run in this module is slow.** pandas is a large download, and your
> browser fetches it once and then keeps it. Later exercises reuse it.

## What a DataFrame is

A table of rows and columns, like a spreadsheet:

| sample_id | site  | temperature_c | count |
| --------- | ----- | ------------- | ----- |
| S001      | north | 12.4          | 31    |
| S002      | north | 13.1          | 28    |
| S003      | south | 18.9          | 44    |

Each **row** is one thing you measured. Each **column** is one property, and a
column holds one kind of value throughout — `temperature_c` is numbers all the
way down.

That last part is the difference from a list of lists. A list does not care that
you put a string in position 2 of one row and a number in position 2 of the
next. A DataFrame column has a type, and it will tell you when the data does not
match it. That is a feature: it is how you find out your file is not what you
thought.

## Loading a file

```python
import pandas as pd

readings = pd.read_csv("readings.csv")
```

`import pandas as pd` is a convention. Almost every piece of pandas code you
will ever read says `pd`, so this course does too.

`read_csv` does a surprising amount: it reads the first line as column names,
works out which columns are numbers and which are text, and handles quoted
fields containing commas. Your own splitting code did none of that.

## Looking before you leap

Three things to check, every single time, before you compute anything:

```python
print(readings.shape)          # (rows, columns)
print(list(readings.columns))  # the column names
print(readings.head(3))        # the first three rows
```

This is not ceremony. The most common cause of a wrong analysis is not a wrong
formula — it is data that was not shaped the way the analyst assumed. A file with
one fewer column than you expected, a header row read as data, a numeric column
that arrived as text because one cell says `n/a`. All three are visible in ten
seconds and invisible forever after if you skip the look.

`head(n)` gives the first `n` rows; `tail(n)` gives the last. Look at both. Bad
rows collect at the end of files.

## Reading a column

```python
temperatures = readings["temperature_c"]
```

Square brackets and the column's name, as a string. What comes back is a
**Series** — a single column, which behaves much like a list you can do
arithmetic on:

```python
print(temperatures.mean())
print(temperatures.max())
```

If you mistype the name you get a `KeyError` naming the column you asked for.
That is the same error a dictionary gives you for a missing key, and for the same
reason: you asked for something that is not there. Print `readings.columns` and
compare, character by character — trailing spaces in headers are common and
invisible.
