---
slug: defining-functions
position: 1
title: Defining and calling functions
worked_example_code: |
  def area(width, height):
      return width * height


  def describe(width, height, unit="m"):
      size = area(width, height)
      return f"{width}x{height} is {size} square {unit}"


  print(area(3, 4))
  print(describe(3, 4))
  print(describe(3, 4, unit="ft"))
worked_example_note: >-
  Two definitions, then three calls. Note that nothing happens when Python reads
  the `def` lines — the bodies only run when something calls them, which is why
  the output starts with 12 rather than anything from line 1.
---

A function is a named piece of work you can run whenever you need it:

```python
def greet(name):
    return f"Hello, {name}!"

print(greet("Ada"))      # Hello, Ada!
print(greet("Alan"))     # Hello, Alan!
```

The `def` line does not run the body. It stores it under a name. The body runs
only when the function is **called** — `greet("Ada")` — and it runs again, from
the top, on every call.

The parts:

- **`def`** starts a definition.
- **`greet`** is the name. Same rules and conventions as a variable.
- **`(name)`** lists the **parameters** — the values the function expects.
- **`:`** and an indented block, the same shape as `if` and `for`.
- **`return`** hands a value back to whoever called it.

## Why bother

Three reasons, roughly in order of how much they matter:

**It stops you repeating yourself.** A calculation written once and called five
times has one place to fix when it is wrong. The same calculation copied five
times has five, and you will find four of them.

**It gives the work a name.** `total = subtotal_with_tax(price, rate)` says what
is happening. Four lines of arithmetic in the middle of a script does not.

**It lets you stop thinking about the details.** Once `area` works, you use it
without rereading it. That is the only way programs get bigger than what you can
hold in your head at once.

## return, and the mistake everybody makes

`return` does two things: it hands a value back, and it **ends the function
immediately**.

```python
def classify(score):
    if score >= 50:
        return "pass"
    return "fail"          # only reached when the if did not return
```

The mistake is printing where you meant to return:

```python
def double(n):
    print(n * 2)           # shows it, hands back nothing

result = double(5)         # prints 10
print(result)              # None
```

`print` puts something on the screen. `return` gives it back to your program.
A function with no `return` hands back `None` — so if you find yourself with an
unexpected `None`, a missing `return` is the first thing to check.

As a rule: **functions that work something out should return it, not print it.**
Then the caller decides whether to print, store, or use it in another sum. A
function that prints can only ever be used one way.

## Arguments and defaults

A parameter can have a default, which makes it optional:

```python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

print(greet("Ada"))                      # Hello, Ada!
print(greet("Ada", "Good morning"))      # Good morning, Ada!
print(greet("Ada", greeting="Hi"))       # Hi, Ada!
```

Naming the argument at the call — `greeting="Hi"` — is worth doing whenever the
value alone would not tell a reader what it means. `send(message, True)` is a
puzzle; `send(message, urgent=True)` is not.

Parameters with defaults must come after those without, which is the one rule
Python enforces here.

## Scope

A variable created inside a function exists only inside it:

```python
def calculate():
    working = 42
    return working

calculate()
print(working)      # NameError: name 'working' is not defined
```

That is a feature, not a restriction. It means you can name something `total`
inside a function without wondering whether some other part of the program is
using `total` for something else. Each call gets its own fresh set of local
variables, and they are discarded when it returns.

A function _can_ read a variable from outside it, but relying on that makes the
function depend on invisible context — it no longer works on its own. Pass what
it needs in as a parameter instead.
