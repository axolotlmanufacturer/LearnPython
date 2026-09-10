---
slug: when-things-go-wrong
position: 2
title: When things go wrong
worked_example_code: |
  print("This line works.")
  print(Hello)
worked_example_note: >-
  Run this deliberately broken program. The first line prints; the second stops
  the program. Read what comes back before moving on — this is the shape of
  every error you will meet.
---

Most people learning to program treat an error message as a slap. It is not. It
is the single most informative thing your computer will ever say to you, and
learning to read one is worth more than memorising any amount of syntax.

So we are doing it now, in the second lesson, before you have written anything
that could break.

## Run the broken example

Press Run on the worked example above. You will get something like this:

```
Traceback (most recent call last):
  File "<your code>", line 2, in <module>
    print(Hello)
NameError: name 'Hello' is not defined
```

That block is called a **traceback**. It has three parts worth reading, and you
read them **from the bottom up**.

### 1. The last line tells you what went wrong

```
NameError: name 'Hello' is not defined
```

`NameError` is the _kind_ of problem. Everything after the colon is the detail:
Python met the word `Hello` and had never been told what it means.

Why not? Because `Hello` has no quotation marks around it. `print("Hello")` says
_"show these five letters"_. `print(Hello)` says _"show me the thing called
Hello"_ — and there is no such thing. One pair of quotes is the whole difference.

### 2. The middle tells you where

```
  File "<your code>", line 2, in <module>
    print(Hello)
```

Line 2 — and it even shows you the line. Start looking there.

One warning: the reported line is where Python _noticed_ the problem, which is
sometimes one line _after_ where you caused it. If line 2 looks blameless, look
at line 1.

### 3. The word "Traceback" is just a heading

It means "here is the trail of what was running". Ignore it for now.

## Above the traceback

On this platform you will also see a plain-language explanation sitting above the
traceback. Use it — but read the traceback underneath as well. By Module 7 you
will be reading them without help, and you will be glad of it, because the
traceback is what you will get everywhere else in your programming life.

## Break something on purpose

The exercise below asks you to _cause_ an error. This is deliberate. Nothing you
type can damage anything, and a person who is not afraid of an error message
learns several times faster than one who is.
