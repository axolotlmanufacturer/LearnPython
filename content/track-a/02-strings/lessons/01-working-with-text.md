---
slug: working-with-text
position: 1
title: Working with text
worked_example_code: |
  name = "  Ada Lovelace  "
  tidy = name.strip()

  print(len(name))
  print(len(tidy))
  print(tidy.upper())
  print(tidy.replace("Ada", "A."))
  print(tidy)
worked_example_note: >-
  Note the last line. Every one of those methods produced a *new* string; none of
  them changed `tidy`, which still holds exactly what it started with.
---

A string is a **sequence of characters**, in order. That word "sequence" does
real work: it means each character has a position, and positions in Python start
at **0**.

```python
word = "python"
#       012345
print(word[0])     # p
print(word[5])     # n
print(len(word))   # 6
```

`len()` gives the number of characters. Since counting starts at 0, the last
position is always `len(word) - 1` — never `len(word)`, which is off the end and
raises an `IndexError`. That off-by-one is the most common indexing mistake
there is, and you will meet it again with lists in Module 5.

## Methods

A **method** is something a value knows how to do to itself. You write it with a
dot after the value:

```python
"hello".upper()        # HELLO
```

The useful ones for now:

| Method                  | Does                         | Example                                     |
| ----------------------- | ---------------------------- | ------------------------------------------- |
| `.upper()` / `.lower()` | Change case                  | `"Yes".lower()` → `"yes"`                   |
| `.strip()`              | Remove spaces from both ends | `" hi ".strip()` → `"hi"`                   |
| `.replace(a, b)`        | Swap every `a` for `b`       | `"2024-01".replace("-", "/")` → `"2024/01"` |
| `.count(x)`             | How many times `x` appears   | `"banana".count("a")` → `3`                 |
| `.startswith(x)`        | Does it begin with `x`?      | `"hello".startswith("he")` → `True`         |

### Strings never change

This is the part worth slowing down for:

```python
greeting = "hello"
greeting.upper()
print(greeting)        # hello — not HELLO
```

`.upper()` did not fail, and it did not do nothing: it produced `"HELLO"` and
then that value was thrown away, because nothing was done with it. Strings in
Python are **immutable** — every method that seems to change one actually builds
a new one.

So you must keep the result:

```python
greeting = greeting.upper()
print(greeting)        # HELLO
```

Almost everyone writes the first version once. Now you know what it means when
your "change" has no effect.

## f-strings

Building a sentence out of `+` gets ugly fast, and needs a `str()` around every
number:

```python
print("You have " + str(count) + " messages")
```

An **f-string** puts the values inside the text instead. Put `f` before the
opening quote, and anything in `{ }` is worked out and dropped in:

```python
print(f"You have {count} messages")
```

No `str()`, no stray spaces to get wrong. You can put a calculation inside the
braces too:

```python
price = 4
quantity = 3
print(f"{quantity} items at {price} each is {price * quantity}")
```

You can also control the formatting — `{value:.2f}` rounds to two decimal places,
which matters as soon as you print money:

```python
print(f"Average: {10 / 3:.2f}")     # Average: 3.33
```

Use f-strings from here on. They are shorter, harder to get wrong, and far easier
to read six months later.
