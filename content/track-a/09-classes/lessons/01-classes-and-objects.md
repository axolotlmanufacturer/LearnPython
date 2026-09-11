---
slug: classes-and-objects
position: 1
title: Classes, instances, and self
worked_example_code: |
  class BankAccount:
      def __init__(self, owner, balance=0):
          self.owner = owner
          self.balance = balance

      def deposit(self, amount):
          self.balance += amount
          return self.balance

      def summary(self):
          return f"{self.owner}: {self.balance}"


  a = BankAccount("Ada")
  b = BankAccount("Alan", 100)

  a.deposit(50)
  b.deposit(5)

  print(a.summary())
  print(b.summary())
worked_example_note: >-
  One class, two accounts. Both call the same deposit method, and each keeps its
  own balance — that separateness is the entire point. Add a third account and
  see that it starts at 0 without affecting the others.
---

Here is a shape you have already written, in Module 5 and Module 6:

```python
account = {"owner": "Ada", "balance": 0}

def deposit(account, amount):
    account["balance"] += amount

def summary(account):
    return f"{account['owner']}: {account['balance']}"
```

Some data, and functions that all take that data as their first argument. It
works. It also has nothing holding it together: `deposit` and `summary` are
related to `account` only by convention, nothing stops another part of the
program writing `account["balnce"]`, and a reader has to notice the pattern.

A **class** makes that grouping explicit:

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def summary(self):
        return f"{self.owner}: {self.balance}"
```

Same data, same operations, now stated as one thing.

## Class and instance

The class is the **description**. An instance is one actual thing made from it:

```python
a = BankAccount("Ada")          # one instance
b = BankAccount("Alan", 100)    # another, entirely separate
```

`BankAccount` is the idea of an account; `a` and `b` are two accounts. Each has
its own `owner` and `balance`, so `a.deposit(50)` cannot affect `b`. That
separateness is what classes are for.

## `__init__`

`__init__` runs automatically when you create an instance. Its job is to set up
the attributes:

```python
def __init__(self, owner, balance=0):
    self.owner = owner
    self.balance = balance
```

You never call it directly — `BankAccount("Ada")` calls it for you. Defaults
work exactly as they do in any function, which is why `balance` can be omitted.

The double underscores mean "Python calls this at a particular moment", not
"private". There are several such methods; `__init__` is the one you need now.

## `self`

Every method takes `self` first, and `self` is **the instance the method was
called on**.

When you write `a.deposit(50)`, Python calls `deposit(a, 50)`. The `self`
parameter is where `a` lands. That is the whole mechanism — it looks like magic
and it is just an argument passed for you.

So:

- `self.balance` is _this_ account's balance.
- `balance` on its own inside a method is a local variable and disappears when
  the method returns — one of the two mistakes everyone makes here.

The other is forgetting `self` in the definition:

```python
def deposit(amount):        # wrong
    ...
a.deposit(50)               # TypeError: takes 1 positional argument but 2 were given
```

Python passed the instance in and the method had nowhere to put it. That error
message, which you met in Module 6, means exactly that here.

## Attributes

Attributes are variables that belong to an instance. Read and set them with a
dot:

```python
print(a.balance)
a.balance = 500
```

Python will let you add new ones from outside too. Be sparing about it: an
attribute that appears halfway through a program is one a reader of `__init__`
will not know exists. Setting them all up in `__init__`, even to `None`,
documents what an instance has.

## When a class is not the answer

A class costs something: more structure to read, more places to look. It earns
its place when **state and behaviour genuinely travel together**, and when there
will be more than one instance.

A function is enough when:

- The work is a calculation with no state to remember — `count_vowels(phrase)`
  gains nothing from being a class.
- There will only ever be one of the thing.
- The class would hold data and nothing else — a dictionary is simpler, and
  plainer to anyone reading it.

The refactor in this module's exercises is worth doing precisely because the
starting code is a case where a class _does_ pay: several functions, all taking
the same data as their first argument, and more than one of the thing.
