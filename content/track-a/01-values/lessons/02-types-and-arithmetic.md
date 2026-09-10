---
slug: types-and-arithmetic
position: 2
title: Types and arithmetic
worked_example_code: |
  print(7 + 3)
  print(7 / 3)
  print(7 // 3)
  print(7 % 3)
  print(type(7))
  print(type("7"))
worked_example_note: >-
  Six lines, six answers. The last two are the important pair: 7 and "7" look
  alike on the page and are not the same kind of thing at all.
---

Every value in Python has a **type** — the kind of thing it is. Four types cover
almost everything you will write in this module.

| Type    | Means                         | Examples               |
| ------- | ----------------------------- | ---------------------- |
| `int`   | A whole number                | `5`, `0`, `-40`        |
| `float` | A number with a decimal point | `3.5`, `2.0`, `-0.001` |
| `str`   | Text ("string" of characters) | `"hello"`, `"5"`, `""` |
| `bool`  | True or false                 | `True`, `False`        |

You can always ask:

```python
print(type(42))        # <class 'int'>
print(type("42"))      # <class 'str'>
```

## The one that catches everyone

`42` and `"42"` are different values of different types. One is a number; the
other is two characters that happen to look like a number.

It matters because `+` does two different jobs depending on what it is given:

```python
print(5 + 3)          # 8    — addition
print("5" + "3")      # 53   — joining text end to end
```

Neither is wrong. `+` between numbers adds; `+` between strings joins. And when
you mix them, Python refuses to guess:

```python
print("5" + 3)
```

```
TypeError: can only concatenate str (not "int") to str
```

Python is telling you it will not decide for you whether you meant `8` or `"53"`.
Say which you meant by converting:

```python
print(int("5") + 3)      # 8   — treat the text as a number
print("5" + str(3))      # 53  — treat the number as text
```

`int()`, `float()` and `str()` are the three conversions you will use constantly.
This becomes urgent in the next module, because everything typed by a user
arrives as text — including things that look exactly like numbers.

## Arithmetic

| Operator    | Does                             | Example             |
| ----------- | -------------------------------- | ------------------- |
| `+` `-` `*` | Add, subtract, multiply          | `3 * 4` is `12`     |
| `/`         | Divide                           | `7 / 2` is `3.5`    |
| `//`        | Divide, discarding the remainder | `7 // 2` is `3`     |
| `%`         | The remainder only               | `7 % 2` is `1`      |
| `**`        | To the power of                  | `2 ** 10` is `1024` |

Two of those are worth dwelling on.

**`/` always gives a `float`**, even when it divides exactly. `10 / 5` is `2.0`,
not `2`. If you want a whole number, use `//`.

**`%` ("modulo") gives what is left over.** It sounds obscure and turns out to be
one of the most useful operators there is: `n % 2` is `0` for every even number,
and `total_minutes % 60` is the minutes part of a duration.

Ordinary arithmetic precedence applies — `*` and `/` before `+` and `-` — and
brackets override it:

```python
print(2 + 3 * 4)      # 14
print((2 + 3) * 4)    # 20
```
