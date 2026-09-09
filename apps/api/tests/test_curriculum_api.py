"""Curriculum delivery, including what must never be delivered."""

from __future__ import annotations

import pytest

from app.content.load import sync_curriculum
from app.content.loader import load_curriculum
from tests.factories import write_exercise, write_lesson, write_module, write_tracks


@pytest.fixture
async def seeded(db, tmp_path):
    """A two-module curriculum loaded into the database."""
    write_tracks(
        tmp_path,
        [
            {"slug": "track-a", "position": 1, "title": "Python Fundamentals"},
            {
                "slug": "track-b",
                "position": 2,
                "title": "Applied Statistics",
                "prerequisite_slug": "track-a",
            },
        ],
    )

    orientation = write_module(tmp_path)
    write_lesson(orientation)
    write_exercise(orientation, hints=["Look at the quotes.", "Use print()."])

    values = write_module(
        tmp_path,
        directory="01-values",
        slug="values",
        position=1,
        title="Values and variables",
        quiz=[
            {
                "slug": "recall-print",
                "prompt_markdown": "Which line shows a value on the screen?",
                "options": ['print("hi")', 'show("hi")'],
                "answer": 'print("hi")',
                "explanation_markdown": "`print` is the built-in that displays a value.",
                "reviews_module_slug": "orientation",
            }
        ],
    )
    write_lesson(values, slug="numbers", title="Numbers", filename="01-numbers.md")
    write_exercise(
        values,
        filename="01-add.yaml",
        slug="add",
        lesson="numbers",
        title="Add two numbers",
        scaffold_level="write_from_spec",
        starter_code="",
        checks=[{"kind": "expr", "label": "total is 7", "expression": "total", "expected": 7}],
        solution_code="total = 3 + 4",
    )

    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()
    return tmp_path


async def test_tracks_are_listed_in_order_with_their_modules(client, seeded):
    response = await client.get("/api/curriculum/tracks")

    assert response.status_code == 200
    tracks = response.json()
    assert [t["slug"] for t in tracks] == ["track-a", "track-b"]
    assert tracks[1]["prerequisite_slug"] == "track-a"
    assert [m["slug"] for m in tracks[0]["modules"]] == ["orientation", "values"]
    assert tracks[0]["modules"][0]["lesson_count"] == 1


async def test_a_module_lists_its_lessons_and_bloom_tagged_objectives(client, seeded):
    response = await client.get("/api/curriculum/modules/values")

    assert response.status_code == 200
    module = response.json()
    assert module["title"] == "Values and variables"
    assert module["objectives"][0]["bloom"] == "understand"
    assert [lesson["slug"] for lesson in module["lessons"]] == ["numbers"]
    assert module["lessons"][0]["exercise_count"] == 1


async def test_an_unknown_module_is_a_404(client, seeded):
    assert (await client.get("/api/curriculum/modules/nope")).status_code == 404


async def test_a_lesson_carries_its_worked_example_and_exercises(client, seeded):
    response = await client.get("/api/curriculum/modules/orientation/lessons/first-steps")

    assert response.status_code == 200
    lesson = response.json()
    assert lesson["worked_example_code"] == 'print("Hello")'
    assert len(lesson["exercises"]) == 1

    exercise = lesson["exercises"][0]
    assert exercise["slug"] == "say-hello"
    assert exercise["scaffold_level"] == "fill_in"
    assert exercise["hints"] == ["Look at the quotes.", "Use print()."]


async def test_an_exercise_carries_the_checks_the_browser_needs_to_grade_it(client, seeded):
    # Grading runs in the learner's browser, so the checks have to travel there.
    # See the note at the top of routers/curriculum.py.
    response = await client.get("/api/curriculum/modules/orientation/lessons/first-steps")

    checks = response.json()["exercises"][0]["checks"]
    assert checks == [
        {"kind": "stdout", "label": "Prints Hello", "expected": "Hello", "match": "normalized"}
    ]


async def test_the_reference_solution_is_never_served(client, seeded):
    response = await client.get("/api/curriculum/modules/orientation/lessons/first-steps")

    body = response.text
    assert "solution" not in body.lower()
    assert "solution_code" not in response.json()["exercises"][0]


async def test_the_reference_solution_is_not_even_in_the_database(db, seeded):
    from sqlalchemy import select

    from app.models import Exercise

    exercises = (await db.execute(select(Exercise))).scalars().all()

    assert exercises
    for exercise in exercises:
        # Anything stored can be leaked by an API mistake; solutions are never
        # loaded at all (see app/models.py).
        assert not hasattr(exercise, "solution_code")


async def test_a_quiz_is_served_without_its_answers(client, seeded):
    response = await client.get("/api/curriculum/modules/values/quiz")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["options"] == ['print("hi")', 'show("hi")']
    assert "answer" not in items[0]
    assert "explanation_markdown" not in items[0]
    # The item revisits the previous module, which is what spaced repetition means.
    assert items[0]["reviews_module_slug"] == "orientation"


async def test_curriculum_is_readable_without_signing_in(client, seeded):
    # Lesson content is not gated: someone deciding whether to sign up should be
    # able to see what they would be learning.
    assert (await client.get("/api/curriculum/tracks")).status_code == 200
    assert (await client.get("/api/curriculum/modules/orientation")).status_code == 200


async def test_reloading_unchanged_content_is_a_no_op(db, seeded, tmp_path):
    from sqlalchemy import select

    from app.models import Exercise

    before = (await db.execute(select(Exercise))).scalars().all()
    hashes_before = {e.slug: e.content_hash for e in before}
    ids_before = {e.slug: e.id for e in before}

    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()

    after = (await db.execute(select(Exercise))).scalars().all()
    assert {e.slug: e.content_hash for e in after} == hashes_before
    # Same rows, not replacements — submissions reference exercises by id.
    assert {e.slug: e.id for e in after} == ids_before


async def test_editing_content_updates_the_existing_row(db, seeded, tmp_path):
    from sqlalchemy import select

    from app.models import Exercise

    original = (await db.execute(select(Exercise).where(Exercise.slug == "say-hello"))).scalar_one()
    original_id = original.id

    write_exercise(
        tmp_path / "track-a" / "00-orientation",
        title="Say hello politely",
    )
    await sync_curriculum(db, load_curriculum(tmp_path))
    await db.commit()
    await db.refresh(original)

    updated = (await db.execute(select(Exercise).where(Exercise.slug == "say-hello"))).scalar_one()
    assert updated.id == original_id
    assert updated.title == "Say hello politely"
