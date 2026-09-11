"""When to resurface a quiz item.

Section 2.4 of the brief asks for retrieval practice on an expanding schedule:
an item answered correctly should come back later and later; an item answered
wrongly should come back soon. That is the whole requirement, and this is the
whole implementation.

Why a Leitner-style doubling rather than SM-2
---------------------------------------------
SM-2 and its descendants model per-item *difficulty* with an ease factor tuned
by a self-reported recall grade ("again / hard / good / easy"). Both halves of
that are a poor fit here:

  * The grade is self-reported. Our items are objectively scored — the learner
    either picked the right option or did not — so there is no confidence rating
    to feed the ease factor, and inventing one from correctness alone reduces
    SM-2 to a doubling schedule with extra arithmetic.
  * SM-2 is tuned for large decks reviewed daily for years. A module quiz here
    is a handful of items over a few weeks. The difference between an optimally
    and a roughly scheduled review at that scale is not something a learner can
    perceive.

So: correct doubles the interval, wrong resets it to one day. The sequence is
1, 2, 4, 8, 16, 32, 64 days, capped so an item never disappears for longer than
a term's worth of study.

The cap matters more than the growth rate. Without it, a learner who answers the
same item correctly eight times in a row would not see it again for well over a
year — by which point the platform has silently stopped being a review system
for that item. `MAX_INTERVAL_DAYS` is the promise that everything comes back
eventually.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

#: Interval for an item seen for the first time, and for one just answered wrong.
FIRST_INTERVAL_DAYS = 1

#: Longest an item may go unseen. See the module docstring.
MAX_INTERVAL_DAYS = 64


def next_interval(previous_days: int | None, correct: bool) -> int:
    """Days until this item should be asked again.

    `previous_days` is the interval the last attempt scheduled, or None if this
    is the first attempt.
    """
    if not correct:
        return FIRST_INTERVAL_DAYS
    if previous_days is None or previous_days < FIRST_INTERVAL_DAYS:
        return FIRST_INTERVAL_DAYS
    return min(previous_days * 2, MAX_INTERVAL_DAYS)


def next_due_at(interval_days: int, *, now: datetime | None = None) -> datetime:
    """When an item on `interval_days` becomes due again."""
    return (now or datetime.now(UTC)) + timedelta(days=interval_days)
