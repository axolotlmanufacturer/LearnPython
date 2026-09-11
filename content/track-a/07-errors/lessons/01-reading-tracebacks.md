---
slug: reading-tracebacks
position: 1
title: Reading a traceback properly
worked_example_code: |
  def average(numbers):
      return sum(numbers) / len(numbers)


  def report(results):
      return f"Average: {average(results)}"


  print(report([10, 20, 30]))
  print(report([]))
worked_example_note: >-
  The first call works. The second fails two function calls deep — run it and
  look at how many frames the traceback has, and which one is actually the
  problem.
---

In Module 0 you learned to read the last line of a traceback and the line number
above it. That was enough when every error came from a two-line program. Now
your programs have functions calling functions, and a traceback has several
frames.

## A traceback with depth

Running the worked example gives something like:

```
Traceback (most recent call last):
  File "<your code>", line 10, in <module>
    print(report([]))
  File "<your code>", line 6, in report
    return f"Average: {average(results)}"
  File "<your code>", line 2, in average
    return sum(numbers) / len(numbers)
ZeroDivisionError: division by zero
```

Three frames. Read them like this:

**Start at the bottom.** The last line is always what went wrong:
`ZeroDivisionError: division by zero`.

**The frame just above it is where it went wrong** — line 2, inside `average`.
That is the line to look at first.

**The frames above that are how you got there**, newest at the bottom. Line 10
called `report`, which on line 6 called `average`. That chain is what tells you
_why_ `average` was handed an empty list, which is usually the real question.

So the error surfaces in `average`, and the actual bug is on line 10, where
something passed in an empty list. **The deepest frame tells you what broke; the
chain tells you who broke it.**

## The exceptions worth knowing by name

You have met all of these already. Collected in one place:

| Exception                          | Usually means                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `NameError`                        | A name is misspelled, or used before it is created                                           |
| `TypeError`                        | An operation got the wrong kind of value — often text where a number was needed              |
| `ValueError`                       | The right type, but an unusable value — `int("twelve")`                                      |
| `IndexError`                       | A position past the end of a list or string                                                  |
| `KeyError`                         | A dictionary key that is not there                                                           |
| `ZeroDivisionError`                | A count that turned out to be zero                                                           |
| `AttributeError`                   | A method that does not exist on that type — often a typo, or the value is not what you think |
| `FileNotFoundError`                | The file is not where you said                                                               |
| `IndentationError` / `SyntaxError` | Python could not read the program at all — nothing ran                                       |

That last row is different in kind from the rest. A `SyntaxError` happens before
your program starts; everything else happens while it is running. That is why a
syntax error shows no traceback frames and no output — there was nothing to
trace.

## Errors are not failures

An exception is Python refusing to guess. When `int("twelve")` stops your
program, the alternative would be for it to invent a number, and then you would
have a wrong answer instead of a clear message — which is a much worse position
to be in.

The habit worth forming is this: read the last line, look at the deepest frame
of _your_ code, and print the values involved on the line above it. Nearly every
bug in this course falls out in under a minute that way.
