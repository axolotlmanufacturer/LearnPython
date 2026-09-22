"""Reloading content: what changes, what is kept, and what is removed.

The loader runs on every deploy. These pin the behaviour a content change relies
on: edits land in place (so learner history keeps pointing at the right rows),
and content deleted from the files is deleted from the database rather than
served forever.
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.content.load import sync_curriculum
from app.content.loader import load_curriculum
from app.models import Exercise, Lesson, Module, Progress, Submission, User
from tests.factories import write_exercise, write_lesson, write_module, write_tracks


def _two_lessons(root):
    write_tracks(root)
    module_dir = write_module(root)
    write_lesson(module_dir)
    write_lesson(
        module_dir, filename="02-next-steps.md", slug="next-steps", position=2, title="Next steps"
    )
    write_exercise(module_dir)
    write_exercise(
        module_dir, filename="02-say-goodbye.yaml", slug="say-goodbye", lesson="next-steps"
    )
    return module_dir


async def _load(db, root) -> dict[str, int]:
    stats = await sync_curriculum(db, load_curriculum(root))
    await db.commit()
    return stats


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _learner(db) -> User:
    user = User(email="learner@example.com", password_hash="x")
    db.add(user)
    await db.flush()
    return user


async def test_a_lesson_deleted_from_the_files_is_deleted_from_the_database(db, tmp_path):
    module_dir = _two_lessons(tmp_path)
    await _load(db, tmp_path)

    (module_dir / "lessons" / "02-next-steps.md").unlink()
    (module_dir / "exercises" / "02-say-goodbye.yaml").unlink()
    stats = await _load(db, tmp_path)

    slugs = (await db.execute(select(Lesson.slug))).scalars().all()
    assert slugs == ["first-steps"]
    # Its exercise goes with it through the foreign key's cascade, so the count
    # is of what the loader removed directly: one lesson.
    assert await _count(db, Exercise) == 1
    assert stats["removed"] == 1


async def test_reloading_unchanged_content_keeps_every_id(db, tmp_path):
    # Learner rows point at ids. A reload that recreated rows would orphan every
    # learner's history on every deploy.
    _two_lessons(tmp_path)
    await _load(db, tmp_path)
    before = (await db.execute(select(Exercise.slug, Exercise.id))).all()

    stats = await _load(db, tmp_path)

    assert (await db.execute(select(Exercise.slug, Exercise.id))).all() == before
    assert stats["removed"] == 0


async def test_learner_history_for_kept_content_survives_a_removal(db, tmp_path):
    module_dir = _two_lessons(tmp_path)
    await _load(db, tmp_path)
    user = await _learner(db)
    kept = (await db.execute(select(Exercise).where(Exercise.slug == "say-hello"))).scalar_one()
    db.add(Submission(user_id=user.id, exercise_id=kept.id, code="x", passed=True))
    await db.commit()

    (module_dir / "lessons" / "02-next-steps.md").unlink()
    (module_dir / "exercises" / "02-say-goodbye.yaml").unlink()
    await _load(db, tmp_path)

    assert await _count(db, Submission) == 1


async def test_learner_history_for_removed_content_goes_with_it(db, tmp_path):
    # Deliberate: progress in a lesson nobody can see would leave its module
    # permanently incomplete. See the docstring of app/content/load.py.
    module_dir = _two_lessons(tmp_path)
    await _load(db, tmp_path)
    user = await _learner(db)
    doomed = (await db.execute(select(Lesson).where(Lesson.slug == "next-steps"))).scalar_one()
    db.add(Progress(user_id=user.id, lesson_id=doomed.id, status="completed"))
    await db.commit()

    (module_dir / "lessons" / "02-next-steps.md").unlink()
    (module_dir / "exercises" / "02-say-goodbye.yaml").unlink()
    await _load(db, tmp_path)

    assert await _count(db, Progress) == 0


async def test_a_module_deleted_from_the_files_is_deleted_from_the_database(db, tmp_path):
    _two_lessons(tmp_path)
    second = write_module(
        tmp_path, directory="01-values", slug="values", position=1, title="Values"
    )
    write_lesson(second, slug="naming", title="Naming things")
    write_exercise(second, slug="name-a-value", lesson="naming")
    await _load(db, tmp_path)

    for path in sorted(second.rglob("*"), reverse=True):
        path.unlink() if path.is_file() else path.rmdir()
    second.rmdir()
    await _load(db, tmp_path)

    assert (await db.execute(select(Module.slug))).scalars().all() == ["orientation"]
