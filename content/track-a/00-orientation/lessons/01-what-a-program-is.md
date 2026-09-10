---
slug: what-a-program-is
position: 1
title: What a program is
worked_example_code: |
  print("Good morning")
  print("The kettle is on")
worked_example_note: >-
  Two instructions, carried out top to bottom. Press Run and watch them appear
  in the output pane in that order — the first line, then the second.
---

Here is the whole idea, and it is smaller than people expect:

> **A program is a list of instructions, carried out one at a time, from top to
> bottom.**

That is genuinely it. Everything else in this course — decisions, repetition,
organising work into named pieces — is a way of controlling _which_ instructions
run and _in what order_. But the default is always the same: start at the top,
do one thing, move down a line.

## What Python is

Python is one particular set of words and punctuation for writing those
instructions. It was designed to be readable, which is why it is a good first
language: a Python program often looks a bit like a terse description of what
you want.

Compare an instruction in Python with the same instruction written in a language
designed for a different purpose:

| Language | "Show the words Good morning"         |
| -------- | ------------------------------------- |
| Python   | `print("Good morning")`               |
| Java     | `System.out.println("Good morning");` |
| C        | `printf("Good morning\n");`           |

They all do the same thing. Python simply asks for less around the edges.

## The editor on this page

Every lesson from here on has an editor and a **Run** button. When you press
Run, your program runs **inside your own browser** — nothing is uploaded, and
nothing runs on our machines.

Two things follow from that, and both matter to you:

- **The first Run takes a few seconds.** Your browser is downloading Python
  itself. After that, runs are more or less instant.
- **You cannot break anything.** Not the page, not your computer, not the
  course. The worst outcome available to you is an error message, and error
  messages are the most useful thing in this entire course. Which is why the
  very next lesson is about reading them.

## Try it

Look at the worked example above, then press Run on the exercise below.
