"""Streaks and badges — and, as much as anything, what they refuse to do.

Section 6 asks for these to stay understated and free of dark patterns. A test
suite can only check the data side of that, but the data side is where the dark
pattern would have to start: there is no way for the interface to nag about a
broken streak if the API never reports one.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.content.load import sync_curriculum
from app.content.loader import load_curriculum
from app.learner import practice_streak
from app.models import Exercise, Submission, User
from tests.factories import write_exercise, write_lesson, write_module, write_tracks


@pytest.fixture
async def seeded(db, tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_lesson(
        module_dir, filename="02-next-steps.md", slug="next-steps", position=2, title="Next steps"
    )
    write_exercise(module_dir)
    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()


async def submit(client, *, passed: bool = True) -> None:
    response = await client.post(
        "/api/progress/submissions",
        json={"exercise_slug": "say-hello", "code": 'print("Hello")', "passed": passed},
    )
    assert response.status_code == 201, response.text


async def practised(db, *, days_ago: list[int]) -> None:
    """Record a submission for each offset, as if made that many days back.

    Written straight to the table because the API has no way to say "yesterday",
    and a streak test that could only ever assert "1" would not be testing much.
    """
    user = (await db.execute(select(User))).scalars().first()
    exercise = (await db.execute(select(Exercise))).scalars().first()
    now = datetime.now(UTC)
    for days in days_ago:
        db.add(
            Submission(
                user_id=user.id,
                exercise_id=exercise.id,
                code='print("Hello")',
                passed=True,
                submitted_at=now - timedelta(days=days),
            )
        )
    await db.commit()


# ------------------------------------------------------------------ summary


async def test_the_summary_requires_a_signed_in_learner(client, seeded):
    assert (await client.get("/api/progress/summary")).status_code == 401


async def test_a_new_learner_has_a_summary_with_nothing_to_celebrate(client, seeded, signed_in):
    response = await client.get("/api/progress/summary")

    assert response.status_code == 200
    # Zero rather than a target missed: there is nothing here for an interface
    # to turn into a shortfall.
    assert response.json() == {
        "streak_days": 0,
        "last_practised_on": None,
        "exercises_passed": 0,
        "completed_module_slugs": [],
        "reviews_due": 0,
    }


async def test_passing_an_exercise_is_counted_once_however_often_it_is_resubmitted(
    client, seeded, signed_in
):
    await submit(client)
    await submit(client)

    assert (await client.get("/api/progress/summary")).json()["exercises_passed"] == 1


async def test_a_failed_attempt_is_not_counted_as_a_pass(client, seeded, signed_in):
    await submit(client, passed=False)

    assert (await client.get("/api/progress/summary")).json()["exercises_passed"] == 0


async def test_a_module_is_badged_only_once_every_lesson_is_done(client, seeded, signed_in):
    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})
    assert (await client.get("/api/progress/summary")).json()["completed_module_slugs"] == []

    await client.put("/api/progress/lessons/orientation/next-steps", json={"status": "completed"})

    assert (await client.get("/api/progress/summary")).json()["completed_module_slugs"] == [
        "orientation"
    ]


async def test_finishing_a_module_puts_its_quiz_in_the_review_count(
    client, db, tmp_path, signed_in
):
    write_tracks(tmp_path)
    module_dir = write_module(
        tmp_path,
        quiz=[
            {
                "slug": "what-print-does",
                "position": 1,
                "prompt_markdown": "What does `print` do?",
                "options": ["Shows a value", "Deletes a file"],
                "answer": "Shows a value",
            }
        ],
    )
    write_lesson(module_dir)
    write_exercise(module_dir)
    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()

    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})

    assert (await client.get("/api/progress/summary")).json()["reviews_due"] == 1


async def test_one_learners_summary_is_not_anothers(client, seeded, signed_in):
    await submit(client)
    await client.post("/api/auth/logout")
    await client.post(
        "/api/auth/register",
        json={"email": "someone-else@example.com", "password": "another-long-password"},
    )

    assert (await client.get("/api/progress/summary")).json()["exercises_passed"] == 0


# ------------------------------------------------------------------- streak


async def test_practising_today_starts_a_streak(client, seeded, signed_in):
    await submit(client)

    body = (await client.get("/api/progress/summary")).json()

    assert body["streak_days"] == 1
    assert body["last_practised_on"] == datetime.now(UTC).date().isoformat()


async def test_a_failing_attempt_still_counts_as_practice(client, seeded, signed_in):
    # Productive struggle (Section 2.6) is practice. A streak that only counted
    # successes would penalise exactly the learner who needed the encouragement.
    await submit(client, passed=False)

    assert (await client.get("/api/progress/summary")).json()["streak_days"] == 1


async def test_several_submissions_in_one_day_are_one_day(client, seeded, signed_in):
    await submit(client)
    await submit(client)
    await submit(client)

    assert (await client.get("/api/progress/summary")).json()["streak_days"] == 1


async def test_consecutive_days_accumulate(client, db, seeded, signed_in):
    await practised(db, days_ago=[0, 1, 2, 3])

    assert (await client.get("/api/progress/summary")).json()["streak_days"] == 4


async def test_a_gap_ends_the_streak_at_the_gap(client, db, seeded, signed_in):
    await practised(db, days_ago=[0, 1, 4, 5])

    # Today and yesterday are consecutive; the two-day hole stops the count
    # there rather than adding the older days on.
    assert (await client.get("/api/progress/summary")).json()["streak_days"] == 2


async def test_yesterday_still_counts_as_a_current_streak(client, db, seeded, signed_in):
    # Otherwise the streak would appear to vanish at midnight and reappear on
    # the day's first exercise, which is precisely the anxiety the brief rules out.
    await practised(db, days_ago=[1, 2])

    assert (await client.get("/api/progress/summary")).json()["streak_days"] == 2


async def test_a_lapsed_streak_reports_zero_rather_than_a_loss(client, db, seeded, signed_in):
    await practised(db, days_ago=list(range(30, 60)))

    body = (await client.get("/api/progress/summary")).json()

    # Zero, with no record of how long the broken streak had been. The interface
    # cannot say "you lost your 30-day streak" because it is never told.
    assert body["streak_days"] == 0
    assert set(body) == {
        "streak_days",
        "last_practised_on",
        "exercises_passed",
        "completed_module_slugs",
        "reviews_due",
    }


async def test_the_streak_is_counted_relative_to_a_given_day(db, seeded, signed_in, client):
    # `today` is a parameter so the day-boundary behaviour is decided by the
    # caller rather than by when the suite happens to run.
    await practised(db, days_ago=[0])
    user = (await db.execute(select(User))).scalars().first()

    days, last = await practice_streak(db, user.id, today=date(2099, 1, 1))

    assert days == 0
    assert last == datetime.now(UTC).date()
