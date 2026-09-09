"""Progress persistence and submissions."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.content.load import sync_curriculum
from app.content.loader import load_curriculum
from app.models import Submission
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


async def test_progress_requires_a_signed_in_learner(client, seeded):
    assert (await client.get("/api/progress")).status_code == 401
    response = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "completed"}
    )
    assert response.status_code == 401


async def test_a_new_learner_has_no_progress(client, seeded, signed_in):
    response = await client.get("/api/progress")

    assert response.status_code == 200
    assert response.json() == []


async def test_marking_a_lesson_complete_records_when(client, seeded, signed_in):
    response = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "completed"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["completed_at"] is not None


async def test_progress_persists_across_sessions(client, seeded, signed_in):
    # The MVP acceptance criterion in Section 11: progress survives signing out
    # and back in, because it lives on the server rather than in the browser.
    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})
    await client.post("/api/auth/logout")
    await client.post("/api/auth/login", json=signed_in)

    response = await client.get("/api/progress")

    assert [row["lesson_slug"] for row in response.json()] == ["first-steps"]
    assert response.json()[0]["status"] == "completed"


async def test_revisiting_a_finished_lesson_does_not_move_its_completion_time(
    client, seeded, signed_in
):
    first = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "completed"}
    )
    again = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "completed"}
    )

    assert again.json()["completed_at"] == first.json()["completed_at"]


async def test_reopening_a_lesson_clears_its_completion_time(client, seeded, signed_in):
    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})

    response = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "in_progress"}
    )

    assert response.json()["completed_at"] is None


async def test_module_status_is_derived_from_its_lessons(client, seeded, signed_in):
    before = await client.get("/api/progress/modules")
    assert before.json()[0] == {
        "module_slug": "orientation",
        "total_lessons": 2,
        "completed_lessons": 0,
        "status": "not_started",
    }

    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})
    midway = await client.get("/api/progress/modules")
    assert midway.json()[0]["status"] == "in_progress"
    assert midway.json()[0]["completed_lessons"] == 1

    await client.put("/api/progress/lessons/orientation/next-steps", json={"status": "completed"})
    done = await client.get("/api/progress/modules")

    # A module cannot read as complete while one of its lessons is not, because
    # the status is computed rather than stored alongside.
    assert done.json()[0]["status"] == "completed"
    assert done.json()[0]["completed_lessons"] == 2


async def test_progress_on_an_unknown_lesson_is_a_404(client, seeded, signed_in):
    response = await client.put(
        "/api/progress/lessons/orientation/nope", json={"status": "completed"}
    )

    assert response.status_code == 404


async def test_an_invalid_status_is_rejected(client, seeded, signed_in):
    response = await client.put(
        "/api/progress/lessons/orientation/first-steps", json={"status": "nearly"}
    )

    assert response.status_code == 422


async def test_a_submission_is_recorded_with_the_learners_code(client, db, seeded, signed_in):
    response = await client.post(
        "/api/progress/submissions",
        json={"exercise_slug": "say-hello", "code": 'print("Hello")', "passed": True},
    )

    assert response.status_code == 201
    stored = (await db.execute(select(Submission))).scalar_one()
    assert stored.code == 'print("Hello")'
    assert stored.passed is True


async def test_failed_attempts_are_kept_too(client, db, seeded, signed_in):
    # Attempts that did not pass are the more interesting ones: they show which
    # exercises trip people up.
    await client.post(
        "/api/progress/submissions",
        json={"exercise_slug": "say-hello", "code": "print(Hello)", "passed": False},
    )
    await client.post(
        "/api/progress/submissions",
        json={"exercise_slug": "say-hello", "code": 'print("Hello")', "passed": True},
    )

    stored = (await db.execute(select(Submission).order_by(Submission.id))).scalars().all()
    assert [s.passed for s in stored] == [False, True]


async def test_one_learners_progress_is_invisible_to_another(client, seeded, signed_in):
    await client.put("/api/progress/lessons/orientation/first-steps", json={"status": "completed"})
    await client.post("/api/auth/logout")

    await client.post(
        "/api/auth/register",
        json={"email": "someone-else@example.com", "password": "another-long-password"},
    )

    assert (await client.get("/api/progress")).json() == []
