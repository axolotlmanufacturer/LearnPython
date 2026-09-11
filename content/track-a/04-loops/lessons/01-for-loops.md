---
slug: for-loops
position: 1
title: for loops and range
worked_example_code: |
  for number in range(5):
      print(number)

  print("---")

  total = 0
  for number in range(1, 5):
      total = total + number
      print(f"added {number}, total is now {total}")
worked_example_note: >-
  Two loops. The first shows what range(5) actually produces — note where it
  starts and where it stops. The second builds a running total, printing each
  step so you can watch it accumulate.
---

A `for` loop runs a block once for each item in a collection:

```python
for letter in "cat":
    print(letter)
```

```
c
a
t
```

Read it as: _"for each letter in `"cat"`, print it."_ The name `letter` is
yours to choose — Python creates it, sets it to the first item, runs the
indented block, sets it to the second item, runs the block again, and so on
until there is nothing left.

The shape is the same as `if`: a line ending in a colon, then an indented block.

## range()

Usually you want to repeat a set number of times rather than walk through text.
`range()` produces a sequence of whole numbers for exactly that:

| Written           | Produces      |
| ----------------- | ------------- |
| `range(5)`        | 0, 1, 2, 3, 4 |
| `range(1, 5)`     | 1, 2, 3, 4    |
| `range(0, 10, 2)` | 0, 2, 4, 6, 8 |
| `range(5, 0, -1)` | 5, 4, 3, 2, 1 |

Two rules cover all four rows, and they are worth committing to memory now
because they explain most off-by-one bugs you will ever write:

> **It starts at 0 unless you say otherwise, and it stops _before_ the number
> you give it.**

So `range(5)` gives you five numbers — but they are 0 to 4, not 1 to 5. And
`range(1, 5)` gives four numbers, not five.

That "stops before" rule is not arbitrary. It means `range(len(word))` gives
exactly the valid positions of `word`, with no adjustment — which is the same
zero-based counting you met with string indexing in Module 2.

## Accumulating

The most useful thing a loop does is build up a result across its runs:

```python
total = 0
for number in range(1, 5):
    total = total + number
print(total)        # 10
```

The pattern has three parts, and leaving any of them out is a classic mistake:

1. **Start the accumulator before the loop.** Put `total = 0` inside, and it
   resets every time round, leaving you with only the last number.
2. **Update it inside the loop.**
3. **Use it after the loop**, when it holds the finished result.

`total = total + number` is so common it has a shorthand: `total += number`.
They mean the same thing. `-=`, `*=` and the rest work the same way.

Counting is the same pattern with `+= 1`:

```python
vowels = 0
for letter in "programming":
    if letter in "aeiou":
        vowels += 1
print(vowels)      # 3
```

Note `in` doing two different jobs in that snippet: in the `for` line it means
"take each item from", and in the `if` line it asks "does this appear in". Both
are ordinary Python and you will see both constantly.
