"""The review queue: what gets asked, when it comes back, and what leaks.

The seeded curriculum here is two modules, so the tests can distinguish "a
module the learner has finished" from "a module they have not".
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.content.load import sync_curriculum
from app.content.loader import load_curriculum
from app.models import QuizAttempt, QuizItem
from tests.factories import write_exercise, write_lesson, write_module, write_tracks

FIRST_QUIZ = [
    {
        "slug": "what-print-does",
        "position": 1,
        "kind": "multiple_choice",
        "prompt_markdown": "What does `print` do?",
        "options": ["Shows a value", "Deletes a file"],
        "answer": "Shows a value",
        "explanation_markdown": "It writes to the output pane.",
    },
    {
        "slug": "quotes-are-required",
        "position": 2,
        "kind": "multiple_choice",
        "prompt_markdown": "Does text need quotes?",
        "options": ["Yes", "No"],
        "answer": "Yes",
        "explanation_markdown": "Without them Python reads it as a name.",
    },
]

SECOND_QUIZ = [
    {
        "slug": "recall-print",
        "position": 1,
        "kind": "multiple_choice",
        "reviews_module_slug": "orientation",
        "prompt_markdown": "From the first module — what does `print` do?",
        "options": ["Shows a value", "Deletes a file"],
        "answer": "Shows a value",
        "explanation_markdown": "Still true.",
    }
]


@pytest.fixture
async def seeded(db, tmp_path):
    """Two modules, each with one lesson and a quiz."""
    write_tracks(tmp_path)

    first = write_module(tmp_path, quiz=FIRST_QUIZ)
    write_lesson(first)
    write_exercise(first)

    second = write_module(
        tmp_path,
        directory="01-values",
        slug="values",
        position=1,
        title="Values",
        quiz=SECOND_QUIZ,
    )
    write_lesson(second, slug="naming", title="Naming things")
    write_exercise(second, slug="name-a-value", lesson="naming")

    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()


async def finish_module(client, module_slug: str, lesson_slug: str) -> None:
    response = await client.put(
        f"/api/progress/lessons/{module_slug}/{lesson_slug}", json={"status": "completed"}
    )
    assert response.status_code == 200, response.text


async def item_id(db, slug: str) -> int:
    result = await db.execute(select(QuizItem).where(QuizItem.slug == slug))
    return result.scalars().first().id


# ------------------------------------------------------------------ the queue


async def test_the_queue_requires_a_signed_in_learner(client, seeded):
    assert (await client.get("/api/quiz/due")).status_code == 401
    assert (
        await client.post("/api/quiz/attempts", json={"quiz_item_id": 1, "answer": "Yes"})
    ).status_code == 401


async def test_nothing_is_due_before_any_module_is_finished(client, seeded, signed_in):
    # A quiz item asks about a whole module. Surfacing one while the learner is
    # still working through that module would test material they have not met.
    response = await client.get("/api/quiz/due")

    assert response.status_code == 200
    assert response.json() == []


async def test_finishing_a_module_makes_its_items_available(client, seeded, signed_in):
    await finish_module(client, "orientation", "first-steps")

    response = await client.get("/api/quiz/due")

    assert [item["slug"] for item in response.json()] == [
        "what-print-does",
        "quotes-are-required",
    ]
    assert all(item["module_slug"] == "orientation" for item in response.json())
    assert all(item["seen_before"] is False for item in response.json())


async def test_an_unfinished_modules_items_stay_out_of_the_queue(client, seeded, signed_in):
    await finish_module(client, "orientation", "first-steps")

    slugs = [item["slug"] for item in (await client.get("/api/quiz/due")).json()]

    assert "recall-print" not in slugs


async def test_the_queue_never_carries_the_answer(client, seeded, signed_in):
    await finish_module(client, "orientation", "first-steps")

    response = await client.get("/api/quiz/due")

    # Not "the answer field is absent" but "the answer string appears nowhere in
    # the response" — a field added later that happens to carry it would fail here.
    assert "answer" not in response.json()[0]
    assert "explanation" not in response.text
    assert "It writes to the output pane." not in response.text


async def test_an_answered_item_leaves_the_queue(client, seeded, signed_in, db):
    await finish_module(client, "orientation", "first-steps")
    answered = await item_id(db, "what-print-does")

    await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": answered, "answer": "Shows a value"}
    )

    slugs = [item["slug"] for item in (await client.get("/api/quiz/due")).json()]
    assert slugs == ["quotes-are-required"]


async def test_an_item_returns_once_it_falls_due(client, seeded, signed_in, db):
    await finish_module(client, "orientation", "first-steps")
    answered = await item_id(db, "what-print-does")
    await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": answered, "answer": "Shows a value"}
    )

    # Reach into the schedule rather than waiting a day for it.
    attempt = (await db.execute(select(QuizAttempt))).scalar_one()
    attempt.due_at = datetime.now(UTC) - timedelta(hours=1)
    await db.commit()

    items = (await client.get("/api/quiz/due")).json()

    assert items[0]["slug"] == "what-print-does"
    assert items[0]["seen_before"] is True


async def test_overdue_reviews_are_asked_before_new_items(client, seeded, signed_in, db):
    await finish_module(client, "orientation", "first-steps")
    answered = await item_id(db, "quotes-are-required")
    await client.post("/api/quiz/attempts", json={"quiz_item_id": answered, "answer": "Yes"})

    attempt = (await db.execute(select(QuizAttempt))).scalar_one()
    attempt.due_at = datetime.now(UTC) - timedelta(days=3)
    await db.commit()

    slugs = [item["slug"] for item in (await client.get("/api/quiz/due")).json()]

    # Material closest to being forgotten comes first, even though the new item
    # sits earlier in the module.
    assert slugs == ["quotes-are-required", "what-print-does"]


# --------------------------------------------------------------- the grading


async def test_a_correct_answer_is_graded_and_explained(client, seeded, signed_in, db):
    response = await client.post(
        "/api/quiz/attempts",
        json={"quiz_item_id": await item_id(db, "what-print-does"), "answer": "Shows a value"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["correct"] is True
    # The explanation comes back for a right answer too: a lucky guess confirmed
    # without a reason teaches nothing.
    assert body["explanation_markdown"] == "It writes to the output pane."


async def test_a_wrong_answer_reveals_the_right_one(client, seeded, signed_in, db):
    response = await client.post(
        "/api/quiz/attempts",
        json={"quiz_item_id": await item_id(db, "what-print-does"), "answer": "Deletes a file"},
    )

    body = response.json()
    assert body["correct"] is False
    assert body["answer"] == "Shows a value"


async def test_grading_happens_on_the_server(client, seeded, signed_in, db):
    # The recorded attempt reflects the server's verdict, not anything the
    # client said about it — the request body carries only the chosen answer.
    await client.post(
        "/api/quiz/attempts",
        json={"quiz_item_id": await item_id(db, "what-print-does"), "answer": "Deletes a file"},
    )

    attempt = (await db.execute(select(QuizAttempt))).scalar_one()
    assert attempt.correct is False


async def test_an_answer_that_is_not_on_offer_is_rejected(client, seeded, signed_in, db):
    response = await client.post(
        "/api/quiz/attempts",
        json={"quiz_item_id": await item_id(db, "what-print-does"), "answer": "Maybe"},
    )

    assert response.status_code == 422
    assert (await db.execute(select(QuizAttempt))).first() is None


async def test_an_unknown_item_is_a_404(client, seeded, signed_in):
    response = await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": 999_999, "answer": "Yes"}
    )

    assert response.status_code == 404


# ------------------------------------------------------------- the schedule


async def test_success_pushes_the_item_further_out_each_time(client, seeded, signed_in, db):
    target = await item_id(db, "what-print-does")
    intervals = []

    for _ in range(3):
        response = await client.post(
            "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Shows a value"}
        )
        intervals.append(response.json()["interval_days"])

    assert intervals == [1, 2, 4]


async def test_a_wrong_answer_brings_the_item_straight_back(client, seeded, signed_in, db):
    target = await item_id(db, "what-print-does")
    for _ in range(3):
        await client.post(
            "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Shows a value"}
        )

    response = await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Deletes a file"}
    )

    assert response.json()["interval_days"] == 1


async def test_one_learners_schedule_does_not_affect_anothers(client, seeded, signed_in, db):
    target = await item_id(db, "what-print-does")
    await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Shows a value"}
    )
    await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Shows a value"}
    )
    await client.post("/api/auth/logout")

    await client.post(
        "/api/auth/register",
        json={"email": "someone-else@example.com", "password": "another-long-password"},
    )
    response = await client.post(
        "/api/quiz/attempts", json={"quiz_item_id": target, "answer": "Shows a value"}
    )

    # The second learner starts at the beginning of the schedule, not partway
    # through the first learner's.
    assert response.json()["interval_days"] == 1
