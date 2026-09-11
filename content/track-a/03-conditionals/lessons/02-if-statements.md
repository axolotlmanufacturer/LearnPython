---
slug: if-statements
position: 2
title: if, elif, else
worked_example_code: |
  score = 72

  if score >= 70:
      print("Distinction")
  elif score >= 50:
      print("Pass")
  else:
      print("Not yet")

  print("Marking finished.")
worked_example_note: >-
  Exactly one of the three branches runs. The last line is not indented, so it
  runs every time — change score to 30 and watch which lines appear.
---

An `if` statement uses a Boolean to decide whether to run a block of code:

```python
if temperature > 30:
    print("It is hot.")
```

Three things are doing work in those two lines:

1. **The condition** — anything that produces `True` or `False`.
2. **The colon** — it ends the `if` line. Forgetting it is the single most
   common syntax error in this module.
3. **The indentation** — four spaces. Indentation is not decoration in Python;
   it is how the language knows which lines belong to the `if`.

That third point is worth seeing rather than reading:

```python
if temperature > 30:
    print("It is hot.")        # only when hot
    print("Drink water.")      # only when hot
print("Have a nice day.")      # always
```

## else and elif

`else` catches everything the `if` did not:

```python
if score >= 50:
    print("Pass")
else:
    print("Not yet")
```

`elif` — short for "else if" — adds more questions, and Python asks them **in
order, stopping at the first that is true**:

```python
if score >= 70:
    print("Distinction")
elif score >= 50:
    print("Pass")
else:
    print("Not yet")
```

A score of 85 is `>= 70`, so it prints `Distinction` and Python never even
considers the `elif`. Exactly one branch of an if/elif/else chain runs — always
one, never two.

### Why that matters more than it sounds

Compare the chain above with the same conditions as separate `if` statements:

```python
if score >= 70:
    print("Distinction")
if score >= 50:
    print("Pass")
```

With a score of 85, **both** print, because they are two independent questions
rather than one decision. That is the difference between `elif` and a second
`if`, and it is a real bug when you want one answer and get two.

### Order matters in an elif chain

```python
if score >= 50:
    print("Pass")
elif score >= 70:
    print("Distinction")     # unreachable
```

Nothing ever reaches that second branch: any score of 70 or more is also 50 or
more, so the first branch catches it. When you write a chain of ranges, start
with the narrowest.

## Nesting

An `if` can go inside another, indented one level further:

```python
if logged_in:
    if is_admin:
        print("Admin dashboard")
    else:
        print("Your profile")
else:
    print("Please sign in")
```

That is legitimate, and it stops being readable quickly. Two levels is usually
fine; if you find yourself at four, that is a signal — and Module 6 gives you
functions, which is the usual way out.
