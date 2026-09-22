---
slug: csv-and-json
position: 2
title: CSV and JSON
worked_example_code: |
  import csv
  import json

  with open("readings.csv", "w") as f:
      f.write("city,celsius\n")
      f.write("Oslo,-3\n")
      f.write("Cairo,35\n")

  with open("readings.csv") as f:
      rows = list(csv.DictReader(f))

  print(rows[0])
  print(rows[0]["celsius"], type(rows[0]["celsius"]))

  summary = {
      "count": len(rows),
      "warmest": max(float(row["celsius"]) for row in rows),
  }

  with open("summary.json", "w") as f:
      json.dump(summary, f)

  with open("summary.json") as f:
      print(json.load(f))
worked_example_note: >-
  Read a CSV into dictionaries, work something out, save it as JSON. Look
  carefully at what type the celsius value comes back as — that is the one thing
  about CSV that catches everyone.
---

Two formats cover most of the data you will meet.

## CSV — a table

Comma-separated values. The first line is usually a header naming the columns:

```
city,celsius
Oslo,-3
Cairo,35
```

You could split each line on commas yourself, and for simple data it works. But
real CSV has commas inside quoted fields — `"Smith, Ada"` is one field, not two —
and a hand-rolled split gets that wrong. Use the `csv` module:

```python
import csv

with open("readings.csv") as f:
    for row in csv.DictReader(f):
        print(row["city"], row["celsius"])
```

`DictReader` reads the header line and hands you a dictionary per row, keyed by
column name. That is almost always what you want — `row["celsius"]` says what it
means where `row[1]` does not.

### Everything comes back as text

This is the thing to remember:

```python
row["celsius"]          # "-3" — a string, not a number
row["celsius"] + 1      # TypeError
float(row["celsius"])   # -3.0 — now it is a number
```

A CSV file is text, so every field arrives as text, exactly like `input()` in
Module 2. Convert the fields you intend to calculate with.

### Writing CSV

```python
with open("out.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["city", "celsius"])
    writer.writerow(["Oslo", -3])
```

`newline=""` is needed when writing CSV, and only then — without it you can get
a blank line between every row on some systems.

## JSON — structured data

JSON holds nested structure, which a table cannot:

```python
import json

data = {"name": "Ada", "scores": [80, 91], "active": True}

with open("profile.json", "w") as f:
    json.dump(data, f, indent=2)

with open("profile.json") as f:
    loaded = json.load(f)

print(loaded["scores"][1])     # 91 — still a number
```

Four functions, and the names are easy to mix up:

| Function             | Does             |
| -------------------- | ---------------- |
| `json.dump(data, f)` | Write to a file  |
| `json.load(f)`       | Read from a file |
| `json.dumps(data)`   | Produce a string |
| `json.loads(text)`   | Parse a string   |

The ones with `s` work on strings; the ones without work on files.

Unlike CSV, **JSON keeps types**. A number saved as a number comes back as a
number, a list as a list. Python's types map onto JSON's closely, with two
things to know: dictionary keys always come back as strings, and tuples are
written as lists, so a tuple you save returns as a list.

## Which to use

| Data                                        | Format |
| ------------------------------------------- | ------ |
| Rows and columns, all the same shape        | CSV    |
| Nested, or fields that vary between records | JSON   |
| Something a spreadsheet must open           | CSV    |
| Something a program must read back exactly  | JSON   |

CSV is a table; JSON is a structure. Forcing nested data into CSV means
inventing a convention for the nesting, and then writing the code that
understands your convention — which is JSON, badly.
