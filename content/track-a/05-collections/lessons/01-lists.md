---
slug: lists
position: 1
title: Lists
worked_example_code: |
  scores = [70, 82, 45, 91]

  print(scores[0])
  print(scores[-1])
  print(scores[1:3])
  print(len(scores))

  scores.append(60)
  print(scores)

  total = 0
  for score in scores:
      total += score
  print(f"Average: {total / len(scores):.1f}")
worked_example_note: >-
  Indexing, slicing, growing the list, then a loop that accumulates across it.
  That last pattern — loop, accumulate, use the result — is most of what lists
  are for.
---

A list holds several values in order, in one variable:

```python
scores = [70, 82, 45, 91]
```

Square brackets, commas between items. A list can hold anything, including a
mixture, though in practice a list whose items are all the same kind of thing is
much easier to work with.

## Getting items out

Positions start at 0 — the same counting as string indexing in Module 2 and
`range()` in Module 4:

```python
scores = [70, 82, 45, 91]
#          0   1   2   3
print(scores[0])      # 70
print(scores[3])      # 91
print(scores[4])      # IndexError: list index out of range
```

Negative positions count from the end, which saves arithmetic:

```python
print(scores[-1])     # 91 — the last item
print(scores[-2])     # 45 — second from last
```

`scores[-1]` is worth preferring over `scores[len(scores) - 1]`: same answer,
less to get wrong.

### Slicing

A slice takes a range of items and gives back a **new list**:

```python
print(scores[1:3])    # [82, 45] — from 1, stopping before 3
print(scores[:2])     # [70, 82] — from the start
print(scores[2:])     # [45, 91] — to the end
```

That "stopping before" rule is the same one as `range()`. It also means
`scores[:2]` and `scores[2:]` split the list cleanly in two, with nothing
missed and nothing repeated.

## Changing a list

Unlike strings, lists **can** be changed in place:

```python
scores[0] = 75           # replace
scores.append(60)        # add to the end
scores.insert(0, 100)    # add at a position
scores.remove(45)        # delete the first 45 it finds
last = scores.pop()      # remove the last item and hand it back
```

This is the practical difference from strings. `greeting.upper()` builds a new
string and leaves the original alone; `scores.append(60)` changes the list
itself and returns nothing. Which leads directly to the mistake:

```python
scores = scores.append(60)     # scores is now None
```

`.append()` returns `None`, so that assignment throws the list away and replaces
it with nothing. Call it and do not assign the result.

`.sort()` has the same trap and catches even experienced people:

```python
scores.sort()                # sorts in place — correct
scores = sorted(scores)      # builds a new sorted list — also correct
scores = scores.sort()       # scores is now None — wrong
```

## Useful things to know

```python
print(len(scores))          # how many items
print(82 in scores)         # True — same `in` as in Module 4
print(sum(scores))          # total, for numbers
print(min(scores), max(scores))
```

And the loop shape that most real programs are built from — walk the list,
decide something about each item, collect what you want:

```python
passes = []
for score in scores:
    if score >= 50:
        passes.append(score)
```

Start with an empty list, append as you go. You will write that shape many times.
