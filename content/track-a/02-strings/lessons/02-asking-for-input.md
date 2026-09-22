---
slug: asking-for-input
position: 2
title: Asking for input
worked_example_code: |
  name = input("What is your name? ")
  print(f"Hello, {name}!")

  age = input("How old are you? ")
  next_year = int(age) + 1
  print(f"Next year you will be {next_year}.")
worked_example_stdin: ["Ada", "36"]
worked_example_note: >-
  Two inputs, handled differently on purpose. The name is used as it arrives.
  The age has to be converted with int() before it can be added to, because
  input() hands back text no matter what was typed.
---

So far your programs have done the same thing every time. `input()` changes that:
it stops, waits for the person running the program to type something, and gives
you back what they typed.

```python
name = input("What is your name? ")
print(f"Hello, {name}!")
```

Two things happen on that first line. The text in the brackets — the **prompt** —
is shown, and then the program waits. Whatever is typed becomes the value of
`name`.

Always put a prompt in. A program that stops with a blank screen and no
explanation looks broken.

> On this platform, exercises supply the answers in advance rather than asking
> you to type them, so a run is repeatable. The exercise tells you what will be
> "typed".

## The rule that catches everyone

> **`input()` always gives you a string. Always.**

Even when what was typed is unmistakably a number:

```python
age = input("How old are you? ")     # someone types 30
print(age + 1)
```

```
TypeError: can only concatenate str (not "int") to str
```

`age` is the _text_ `"30"`, not the number `30`. Python will not silently decide
which you meant. So convert it:

```python
age = int(input("How old are you? "))
print(age + 1)                        # 31
```

That nested form — `int(input(...))` — reads inside-out: `input` collects the
text, `int` turns it into a number, and the result is stored. Use `float()`
instead when the answer can have a decimal point.

### When conversion fails

`int()` only accepts text that is entirely digits:

```python
int("30")        # 30
int("thirty")    # ValueError: invalid literal for int() with base 10: 'thirty'
int("30.5")      # ValueError — there is a decimal point in it
```

So a program that converts input can be stopped by someone typing the wrong
thing. Right now, that is fine — it is a normal error and you can read it.
Module 7 shows you how to catch it and ask again rather than stopping, which is
what a real program does.

## Two habits worth forming now

**Strip what you are given.** People type stray spaces. `input().strip()` costs
nothing and saves confusion.

**Compare in a consistent case.** Someone answering a yes/no question might type
`yes`, `Yes` or `YES`. Convert to one case before comparing:

```python
answer = input("Continue? ").strip().lower()
```

You will use that exact line in Module 3, as soon as you have `if` statements to
compare things with.
