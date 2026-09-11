"""The review schedule, tested without a database.

Keeping this logic pure is what makes it testable this directly — the schedule
is the pedagogically load-bearing part of Section 2.4, so it is worth being able
to state its behaviour without also standing up Postgres.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.spaced_repetition import (
    FIRST_INTERVAL_DAYS,
    MAX_INTERVAL_DAYS,
    next_due_at,
    next_interval,
)


def test_a_first_correct_answer_schedules_the_shortest_interval():
    assert next_interval(None, correct=True) == FIRST_INTERVAL_DAYS


def test_a_first_wrong_answer_also_comes_back_tomorrow():
    assert next_interval(None, correct=False) == FIRST_INTERVAL_DAYS


def test_repeated_success_expands_the_interval():
    intervals = []
    current: int | None = None
    for _ in range(6):
        current = next_interval(current, correct=True)
        intervals.append(current)
    assert intervals == [1, 2, 4, 8, 16, 32]


def test_a_wrong_answer_resets_a_long_interval():
    assert next_interval(32, correct=False) == FIRST_INTERVAL_DAYS


def test_the_interval_is_capped_so_nothing_disappears_forever():
    # Without a cap, a long run of correct answers would push an item beyond any
    # horizon a learner is studying over, which silently stops it being reviewed.
    current = MAX_INTERVAL_DAYS
    for _ in range(5):
        current = next_interval(current, correct=True)
    assert current == MAX_INTERVAL_DAYS


@pytest.mark.parametrize("stored", [0, -3])
def test_a_nonsense_stored_interval_falls_back_to_the_first(stored: int):
    # Defensive: a zero would otherwise double to zero and make the item due
    # forever, turning one bad row into an unreviewable item.
    assert next_interval(stored, correct=True) == FIRST_INTERVAL_DAYS


def test_due_date_is_the_interval_away_from_now():
    now = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)
    assert next_due_at(4, now=now) == datetime(2026, 3, 5, 12, 0, tzinfo=UTC)
