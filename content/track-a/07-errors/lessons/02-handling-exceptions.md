---
slug: handling-exceptions
position: 2
title: try, except, and designing for failure
worked_example_code: |
  def to_number(text):
      try:
          return int(text)
      except ValueError:
          return None


  for entry in ["42", "twelve", "7", ""]:
      result = to_number(entry)
      if result is None:
          print(f"{entry!r} is not a number")
      else:
          print(f"{entry!r} is {result}")
worked_example_note: >-
  One risky line inside the try, and only ValueError caught. The loop keeps
  going past the bad entries instead of stopping at the first one — which is the
  whole point.
---

Some failures are genuinely expected. A person typing their age will sometimes
type `twelve`. A file will sometimes not be there. For those, you do not want
the program to stop — you want it to cope.

```python
try:
    age = int(input("Age? "))
except ValueError:
    print("That was not a whole number.")
```

Python runs the `try` block. If the named exception happens, it stops that block
immediately and runs the `except` block instead. If nothing goes wrong, the
`except` block is skipped entirely.

## Catch the specific exception

It is tempting to write `except:` and catch everything. Resist it:

```python
try:
    value = int(text)
except:                     # catches everything, including your own typos
    value = 0
```

That will happily swallow a `NameError` from a misspelled variable and quietly
carry on with `0`. You have then hidden a real bug behind a plausible-looking
answer, which is the single worst outcome available — worse than crashing,
because a crash tells you where to look.

Name what you expect:

```python
except ValueError:
```

If a `KeyError` turns up that you did not anticipate, you _want_ to hear about
it.

## Keep the try block small

Only the line that can fail belongs inside:

```python
# Not this
try:
    data = load_everything()
    total = int(data["count"])
    report(total)
except ValueError:
    print("Bad count")

# This
data = load_everything()
try:
    total = int(data["count"])
except ValueError:
    print("Bad count")
    total = 0
report(total)
```

In the first version, a `ValueError` raised deep inside `report` would be
reported as a bad count. The `try` block is a claim about _which_ line you
expect to fail; a large one makes a claim you cannot support.

## else and finally

```python
try:
    number = int(text)
except ValueError:
    print("Not a number")
else:
    print(f"Twice that is {number * 2}")   # only if nothing was raised
finally:
    print("Done")                           # always, either way
```

`else` holds the work that should only happen when the risky line succeeded —
it keeps that work out of the `try`, which is the small-block rule again.
`finally` always runs, and is for cleanup you cannot skip.

## Asking until the answer is usable

This is the shape you were promised in Module 4, now that you can catch the bad
input:

```python
while True:
    try:
        age = int(input("Age? "))
        break                 # only reached if int() succeeded
    except ValueError:
        print("Please type a whole number.")
```

`while True` with a `break` is the idiomatic form here: the condition — "we have
a usable answer" — cannot be tested until after the attempt, so it lives in the
body rather than the header.

## When _not_ to catch

Catching an exception says "I expected this and I know what to do about it". If
neither half is true, let it stop the program.

A `KeyError` in the middle of a calculation usually means your data is not the
shape you think it is. Catching it and carrying on with a default buries that.
Stopping is loud, immediate, and points at the line — which is exactly what you
want from a bug you did not anticipate.

**Handle what you predicted. Let the rest stop the program.**
