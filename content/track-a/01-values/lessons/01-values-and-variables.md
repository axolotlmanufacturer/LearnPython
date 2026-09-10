---
slug: values-and-variables
position: 1
title: Values and variables
worked_example_code: |
  price = 4
  quantity = 3
  total = price * quantity
  print(total)
worked_example_note: >-
  Read it as four instructions in order. The first two store a number under a
  name. The third works something out from those names and stores the result
  under a third name. Only the fourth shows anything.
---

A **value** is a single piece of information: the number `4`, the text
`"hello"`, the answer `True`. Programs are almost entirely made of values and
things done to them.

## Giving a value a name

You will want to use the same value more than once, so you give it a name:

```python
price = 4
```

Read the `=` as **"is given the value"**, not as "equals". It is an instruction,
not a statement of fact. It says: _take the value 4, and from now on let the
name `price` refer to it._

The name is called a **variable**, because what it refers to can be changed:

```python
score = 10
score = 25
print(score)     # 25 — the second line replaced the first
```

There is no history kept. `score` refers to `25` now, and the `10` is gone.

## Using one variable to make another

```python
price = 4
quantity = 3
total = price * quantity
```

The right-hand side is worked out _first_, and only then does the name on the
left get its value. So `total` becomes `12`.

An important consequence: `total` is now just the number `12`. It is not a live
link back to `price` and `quantity`. Changing `price` afterwards does **not**
change `total` — the calculation has already happened.

```python
price = 4
total = price * 3    # total is 12
price = 100          # total is still 12
```

That trips almost everyone up once. Better here than in something that matters.

## Naming things

Python's only rules are that a name must start with a letter or underscore, and
contain no spaces. But there is a rule you should adopt on top of that:

> **Name things for what they mean, not for what they are.**

`total_price` is worth more than `t`, and much more than `x`. You will read your
own code far more often than you write it, and a good name is the difference
between reading and deciphering.

Python also treats capital letters as different letters: `score`, `Score` and
`SCORE` are three unrelated names. When you get a `NameError` on a name you are
certain you created, check the capitals first.

By convention, Python names are written in `lower_case_with_underscores`.
