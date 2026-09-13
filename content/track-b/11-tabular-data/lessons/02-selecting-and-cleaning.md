---
slug: selecting-and-cleaning
position: 2
title: Selecting rows, and what to do about gaps
worked_example_code: |
  import pandas as pd

  readings = pd.read_csv("readings.csv")

  north = readings[readings["site"] == "north"]
  print(len(north))

  readings["temp_f"] = readings["temperature_c"] * 9 / 5 + 32
  print(readings[["site", "temperature_c", "temp_f"]].head(3))

  print(readings["temperature_c"].isna().sum())
worked_example_note: >-
  Filter, derive, then count the gaps. The condition inside the square brackets
  is the unfamiliar part — `readings["site"] == "north"` is not a single
  True/False but one per row, and the DataFrame keeps the rows where it was True.
---

Loading a table is the easy half. Now: how do you get at part of it, and what do
you do about the parts that are not there?

## Filtering rows

```python
north = readings[readings["site"] == "north"]
```

Read the inside first. `readings["site"] == "north"` compares a whole column to a
value, and gives back a **column of True and False** — one per row:

```
0     True
1     True
2    False
3    False
```

Putting that inside `readings[...]` keeps the rows where it was True. This is the
one piece of pandas syntax that looks strangest at first and is used most often.
It is worth printing the inner part on its own once, so you see the True/False
column with your own eyes.

Combining conditions needs `&` for and, `|` for or, and — this catches everyone
— **brackets around each condition**:

```python
warm_north = readings[(readings["site"] == "north") & (readings["temperature_c"] > 12)]
```

Without the brackets Python's operator precedence groups it wrongly and you get
an error that does not obviously say so. Use `and`/`or` here and you get a
different error, because those work on single true-or-false values and there are
thousands of them. Both are ordinary mistakes; neither is a sign you have
misunderstood something deep.

## Adding a column

```python
readings["temp_f"] = readings["temperature_c"] * 9 / 5 + 32
```

The arithmetic applies to every value in the column, and the result is assigned
as a new column. No loop. If you find yourself writing `for` over a DataFrame,
pause — there is almost always a way to say it to the whole column at once, and
it will be both shorter and faster.

## Missing values

Real data has holes. A sensor failed, a sample was contaminated, someone left a
cell blank. pandas represents these as `NaN` — "not a number" — and gives you
`isna()` to find them:

```python
print(readings["temperature_c"].isna().sum())
```

`isna()` gives a True/False column; `sum()` counts the Trues, because True counts
as 1. Chaining those two is the standard way to ask "how many are missing".

### What to do about them is a judgement, not a default

You have three options and none of them is automatically right:

**Drop the rows.** `readings.dropna()` removes any row with a gap anywhere.
Honest and simple. But if 30% of rows have one missing value in a column you were
not going to use, you have thrown away 30% of your data for nothing.

**Drop rows missing something you need.**
`readings.dropna(subset=["temperature_c"])` removes only rows where that specific
column is empty. Usually the right call.

**Fill them in.** `readings["temperature_c"].fillna(0)` replaces gaps with a
value. Be careful: filling a temperature with 0 does not mean "unknown", it means
"zero degrees", and every average you compute afterwards is wrong in a way
nothing will warn you about.

The rule worth carrying: **say what you did and why.** A missing value is
information — it tells you something failed. Silently making it disappear is how
an analysis becomes untrustworthy. When you drop rows, count them first and
report the count.

```python
before = len(readings)
usable = readings.dropna(subset=["temperature_c"])
print(f"Dropped {before - len(usable)} rows with no temperature.")
```

That one printed line is the difference between an analysis someone can check and
one they have to take on faith.
