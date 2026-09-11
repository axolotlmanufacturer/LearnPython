---
slug: reading-and-writing
position: 1
title: Reading and writing files
worked_example_code: |
  with open("notes.txt", "w") as f:
      f.write("first line\n")
      f.write("second line\n")

  with open("notes.txt") as f:
      contents = f.read()

  print(repr(contents))

  with open("notes.txt") as f:
      for line in f:
          print(repr(line))
worked_example_note: >-
  Write, then read the whole thing, then read it a line at a time. `repr()` is
  used deliberately — it shows the newline characters, which is what makes the
  difference between the two reading styles visible.
---

A program that only prints has nothing left when it stops. Files are how results
survive.

> On this platform, files live in a small private space in your browser that is
> emptied between runs. Nothing touches your actual computer, and each Run starts
> with a clean slate — so a file you wrote last time is gone, and an exercise
> that needs a file to read is given one.

## Opening

```python
with open("notes.txt") as f:
    contents = f.read()
```

Two parts:

**`open(...)`** takes the file name and a mode:

| Mode  | Does               | If the file exists   |
| ----- | ------------------ | -------------------- |
| `"r"` | Read (the default) | Reads it             |
| `"w"` | Write              | **Empties it first** |
| `"a"` | Append             | Adds to the end      |

`"w"` is worth pausing on. It does not ask, and it does not warn: opening an
existing file for writing throws its contents away immediately. If you mean to
add, use `"a"`.

**`with`** closes the file when the block ends — including when something in the
block raises an exception. Writing `f = open(...)` without it works right up
until an error leaves the file open with your data still buffered and unwritten.
Always use `with`.

## Three ways to read

```python
with open("notes.txt") as f:
    everything = f.read()          # one big string

with open("notes.txt") as f:
    lines = f.readlines()          # a list of lines

with open("notes.txt") as f:
    for line in f:                 # one line at a time
        print(line.strip())
```

The loop is usually the right one. It never holds more than one line in memory,
so it works the same on a file of ten lines and a file of ten million.

**Every line you read keeps its newline character** — `"first line\n"`, not
`"first line"`. That trailing `\n` is behind most surprises in this module: it
makes `print` add a blank line, and it makes `line == "done"` false when the
line clearly says `done`. `.strip()` removes it.

## Writing

```python
with open("results.txt", "w") as f:
    f.write("Total: 42\n")
    f.write("Checked: yes\n")
```

`.write()` does **not** add a newline — unlike `print`, which always does. Two
`.write()` calls without `\n` produce one run-on line.

To write a list of lines:

```python
names = ["Ada", "Alan"]
with open("names.txt", "w") as f:
    for name in names:
        f.write(name + "\n")
```

## When the file is not there

`open("missing.txt")` raises `FileNotFoundError`. This is exactly the kind of
failure Module 7 called predictable, so it is one to handle rather than let stop
the program:

```python
try:
    with open("settings.txt") as f:
        settings = f.read()
except FileNotFoundError:
    settings = ""            # sensible default: no settings yet
```

Note the shape — catch the specific exception, and only around the risky part.
The rest of the program carries on with a default that means something.
