---
slug: dictionaries
position: 2
title: Dictionaries, tuples and sets
worked_example_code: |
  ages = {"Ada": 36, "Alan": 41, "Grace": 45}

  print(ages["Ada"])
  print(ages.get("Nobody"))
  print("Alan" in ages)

  ages["Katherine"] = 52
  print(len(ages))

  for name, age in ages.items():
      print(f"{name} is {age}")
worked_example_note: >-
  Note the difference between line 3 and line 4. One of those two ways of
  looking something up stops the program when the key is missing, and the other
  does not — change "Nobody" to ages["Nobody"] and run it to see which.
---

A list finds things by **position**. A dictionary finds them by **name**:

```python
ages = {"Ada": 36, "Alan": 41}
print(ages["Ada"])      # 36
```

Curly braces, and each entry is a `key: value` pair. The key is what you look
things up by; the value is what you get back. Keys are usually strings, and must
be unique — assigning to an existing key replaces its value rather than adding a
second entry.

This is the right shape whenever your data has _labels_ rather than an order.
Two lists kept in step —

```python
names = ["Ada", "Alan"]
ages = [36, 41]
```

— is a dictionary written the hard way, and it breaks the moment the two lists
get out of step.

## Looking things up

```python
ages["Ada"]              # 36
ages["Nobody"]           # KeyError: 'Nobody' — stops the program
ages.get("Nobody")       # None — carries on
ages.get("Nobody", 0)    # 0 — your own fallback
```

Use `[...]` when a missing key means something has gone wrong and you want to
know immediately. Use `.get(...)` when a missing key is expected and you have a
sensible default. Choosing the wrong one is how you end up with either a crash
you did not want or a silent `None` spreading through your program.

`in` checks for a key, never a value:

```python
print("Ada" in ages)     # True
print(36 in ages)        # False — 36 is a value, not a key
```

## Changing and looping

```python
ages["Grace"] = 45       # add or replace
del ages["Alan"]         # remove
```

Three ways to loop, and picking the right one makes the code read properly:

```python
for name in ages:               # keys
for age in ages.values():       # values
for name, age in ages.items():  # both at once
```

The last one is what you want most of the time. It unpacks each pair into two
names, so you are not looking anything up inside the loop.

## Tuples

A tuple is a list that cannot be changed:

```python
point = (3, 4)
point[0] = 5        # TypeError
```

Round brackets instead of square. Use one when the _number and meaning_ of the
items is fixed — coordinates, a colour as red/green/blue, a row from a table.
The fixedness is the feature: a tuple says "this has exactly these parts", where
a list says "this holds however many of these".

You have already used tuples without noticing. `.items()` gives you one per
entry, and swapping two variables can be written:

```python
left, right = right, left
```

That builds a tuple on the right and unpacks it on the left — a much better
answer to the Module 1 swap exercise than the spare variable.

## Sets

A set holds unique items with no order:

```python
words = ["the", "cat", "sat", "the", "cat"]
unique = set(words)
print(len(unique))       # 3
```

Two jobs a set does far better than a list: **removing duplicates**, and
**checking membership of something large**. `in` on a set is effectively instant
however many items it holds, while on a list it walks the whole thing.

What you give up is order and duplicates. If either matters, use a list.

## Choosing

| Need                                             | Use        |
| ------------------------------------------------ | ---------- |
| An ordered collection you will add to and change | list       |
| Look something up by a name or id                | dictionary |
| A fixed group of related values                  | tuple      |
| Unique items, or fast "is it in here?"           | set        |

Picking the right one usually makes the code that follows shorter. Reaching for
a list every time is the most common way to make a program harder than it needs
to be.
