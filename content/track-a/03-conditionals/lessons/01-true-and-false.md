---
slug: true-and-false
position: 1
title: True, False, and comparisons
worked_example_code: |
  age = 20

  print(age > 18)
  print(age == 20)
  print(age != 20)
  print(age > 18 and age < 65)
  print(age < 13 or age > 65)
  print(not age > 18)
worked_example_note: >-
  Six comparisons, six answers that are only ever True or False. Change the first
  line to 70 and run it again — watch which answers flip and which do not.
---

You met `bool` in Module 1 as one of the four basic types. It has exactly two
values: `True` and `False`. Both are capitalised, and neither takes quotes —
`True` is a Boolean, `"True"` is a piece of text.

Booleans matter because comparisons produce them, and `if` statements consume
them. That is the whole chain.

## Comparisons

| Operator  | Asks                            | `5 ? 3`         |
| --------- | ------------------------------- | --------------- |
| `==`      | Are these the same?             | `False`         |
| `!=`      | Are these different?            | `True`          |
| `>` `<`   | Greater, less                   | `True`, `False` |
| `>=` `<=` | Greater or equal, less or equal | `True`, `False` |

**`=` and `==` are different operators and this is worth dwelling on.** A single
`=` stores a value. A double `==` asks a question:

```python
score = 10        # "let score be 10"
score == 10       # "is score 10?"  → True
```

Writing `if score = 10:` is a syntax error, and Python will tell you so
specifically — it is such a common slip that it has its own error message.

Comparisons work on text too, using dictionary order:

```python
print("apple" < "banana")    # True
print("Zoe" < "adam")        # True — capitals sort before lower case
```

That last one surprises people. Capital letters come first in the underlying
character order, which is why comparing text you want to treat as equal usually
means `.lower()` on both sides first.

## Combining comparisons

| Operator | True when                     |
| -------- | ----------------------------- |
| `and`    | **Both** sides are true       |
| `or`     | **At least one** side is true |
| `not`    | Flips it                      |

```python
temperature = 22
print(temperature > 15 and temperature < 25)    # True — both hold
print(temperature < 0 or temperature > 30)      # False — neither holds
```

Two things to know about `or`. It is _inclusive_: `True or True` is `True`, not
`False`. And in ordinary English "or" often means "one or the other but not
both" — Python's does not.

Python also allows the form you would write in mathematics:

```python
print(15 < temperature < 25)     # True — and it reads better
```

## A trap worth meeting now

Each side of `and` or `or` must be a complete comparison. This looks reasonable
and does not do what you would expect:

```python
day = "Sunday"
print(day == "Saturday" or "Sunday")     # True — but always True
```

Python reads that as `(day == "Saturday") or ("Sunday")`, and a non-empty string
counts as true on its own, so the whole thing is true whatever `day` holds. Say
the comparison twice:

```python
print(day == "Saturday" or day == "Sunday")
```

You will write the broken version at some point. Now you will recognise it.
