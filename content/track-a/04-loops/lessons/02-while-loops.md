---
slug: while-loops
position: 2
title: while loops, and the one that never ends
worked_example_code: |
  countdown = 3

  while countdown > 0:
      print(countdown)
      countdown -= 1

  print("Go!")
worked_example_note: >-
  Three things make this loop end: countdown starts above 0, the condition
  checks it, and the body changes it in the direction that eventually makes the
  condition false. Delete the last line of the loop body and press Run to see
  what happens when one of the three is missing.
---

A `while` loop repeats **as long as a condition stays true**:

```python
countdown = 3
while countdown > 0:
    print(countdown)
    countdown -= 1
```

Python checks the condition, runs the block if it is true, then checks again.
When the condition is finally false, the loop ends and the program carries on.

## Which loop to use

| Use     | When                                                              |
| ------- | ----------------------------------------------------------------- |
| `for`   | You know what to work through — a string, a range, a list         |
| `while` | You are waiting for something to change, and do not know how long |

Anything a `for` loop does, a `while` loop can do with more typing and more
chances to get it wrong. So reach for `for` first, and use `while` when there
genuinely is no known number of repetitions — waiting for valid input, or
searching until something is found.

## The loop that never ends

Here is the most common bug in this entire course:

```python
countdown = 3
while countdown > 0:
    print(countdown)
```

`countdown` starts at 3. The condition is true. The body prints. The condition
is checked again — and nothing has changed it, so it is still true. Forever.

On this platform that program will print a lot of threes, then stop after a few
seconds with a message telling you what happened. It cannot hurt anything. In
most other places, it would sit there consuming your computer until you killed
it, which is why it is worth learning to spot now.

**Every `while` loop needs three things.** When a loop never ends, one of them
is missing, and going through them in order finds it every time:

1. Something set **before** the loop that the condition tests.
2. A condition that **can** become false.
3. A change **inside** the loop that moves towards making it false.

Number 3 is the one that goes missing. Number 2 is subtler and worth an example:

```python
countdown = 3
while countdown != 0:
    countdown -= 2      # 3, 1, -1, -3, ... never exactly 0
```

That has all three parts and still never ends, because the condition steps
straight over the value it was waiting for. `> 0` would have been safe where
`!= 0` is not. Prefer `<` and `>` over `==` and `!=` in a loop condition unless
you are certain you will land exactly on the value.

## break and continue

Two words change a loop's flow from inside it:

- **`break`** leaves the loop immediately.
- **`continue`** skips the rest of this time round and goes back to the top.

```python
for number in range(10):
    if number == 5:
        break
    print(number)        # 0 1 2 3 4
```

```python
for number in range(6):
    if number % 2 == 1:
        continue
    print(number)        # 0 2 4
```

`break` is genuinely useful when searching: you have found what you wanted, and
carrying on is wasted work. Be more suspicious of `continue` — most uses of it
are an `if` written inside out, and the version with the condition the other way
round usually reads better:

```python
for number in range(6):
    if number % 2 == 0:
        print(number)
```

A `while True:` loop with a `break` in it is a deliberate, idiomatic
exception to everything above — the condition lives in the body rather than the
header. It is the normal shape for "keep asking until the answer is valid",
which you will write properly in Module 7 once you can catch bad input.
