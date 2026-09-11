---
slug: projects
position: 1
title: Three projects
worked_example_code: |
  # A sketch of the shape every one of these projects wants.
  # Run it, then go and write your own.

  def load_data():
      return [{"name": "widget", "price": 4}, {"name": "gadget", "price": 11}]


  def expensive(items, threshold):
      return [item for item in items if item["price"] > threshold]


  def report(items):
      for item in items:
          print(f"{item['name']}: {item['price']}")


  def main():
      items = load_data()
      report(expensive(items, 5))


  main()
worked_example_note: >-
  Four small functions and a main() that says what the program does in three
  lines. This is the shape to aim for — not because it is clever, but because
  each piece can be checked on its own, and the top of the file reads as a
  summary rather than a wall.
---

You can now read input, make decisions, repeat work, hold data in collections,
organise code into functions, handle failures, and save results to files. That
is enough to write real programs, and the only way to find out whether you can
is to write one.

Each project below is specified precisely enough to be checked automatically,
and loosely enough that your solution will not look like anyone else's. Pick one.

## How to approach a program this size

The mistake is opening the editor and starting at line 1. Three things help more:

**Write down what it does before how it does it.** Three or four sentences, in
plain English. If you cannot describe it, you cannot build it.

**Find the nouns and the verbs.** The nouns are your data — a question, a
contact, a row. The verbs are your functions — `ask_question`, `add_contact`,
`summarise`. That mapping will not be perfect and it gets you started.

**Make the smallest thing that runs, then grow it.** A quiz that asks one
hard-coded question and says nothing else is a working program. Add the second
question, then the score, then the input validation. A program that has run
correctly at every step is far easier to debug than one written whole and run
once.

## On structure

Each project's checks look only at what your program _does_. The rubric
underneath each one asks about what the checks cannot see — and those criteria
are where the difference between a program that works and a program that is good
actually lives.

Two that are worth stating outright:

**A function should do one thing.** If you cannot name it without using "and",
it is probably two functions.

**`main()` at the bottom, everything else above it.** A reader should be able to
read your `main()` and know what the program does without reading anything else.
