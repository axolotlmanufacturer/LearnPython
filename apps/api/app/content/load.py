"""Load `content/` into the database.

Run as `make content-load` (or `python -m app.content.load`). Idempotent: records
whose authored content is unchanged are left alone, so this is safe to run on
every deploy rather than treated as a one-off migration.

Reference solutions are read by the loader's validation but never written to the
database — see the note at the top of app/models.py.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.content.loader import ContentError, content_hash, harness_payload, load_curriculum
from app.content.schema import Curriculum, LessonFile, ModuleFile
from app.db import dispose_engine, get_session_factory
from app.models import Exercise, Lesson, Module, QuizItem, Track


async def sync_curriculum(db: AsyncSession, curriculum: Curriculum) -> dict[str, int]:
    stats = {"tracks": 0, "modules": 0, "lessons": 0, "exercises": 0, "quiz_items": 0}

    track_ids: dict[str, int] = {}
    for track_file in curriculum.tracks:
        result = await db.execute(select(Track).where(Track.slug == track_file.slug))
        track = result.scalar_one_or_none()
        if track is None:
            track = Track(slug=track_file.slug)
            db.add(track)
        track.position = track_file.position
        track.title = track_file.title
        track.summary_markdown = track_file.summary_markdown
        track.prerequisite_slug = track_file.prerequisite_slug
        await db.flush()
        track_ids[track_file.slug] = track.id
        stats["tracks"] += 1

    for module_file in curriculum.modules:
        module = await _sync_module(db, module_file, track_ids[module_file.track])
        stats["modules"] += 1

        for lesson_file in module_file.lessons:
            stats["exercises"] += await _sync_lesson(db, lesson_file, module.id)
            stats["lessons"] += 1

        stats["quiz_items"] += await _sync_quiz(db, module_file, module.id)

    return stats


async def _sync_module(db: AsyncSession, module_file: ModuleFile, track_id: int) -> Module:
    result = await db.execute(
        select(Module).where(Module.track_id == track_id, Module.slug == module_file.slug)
    )
    module = result.scalar_one_or_none()
    if module is None:
        module = Module(track_id=track_id, slug=module_file.slug)
        db.add(module)

    digest = content_hash(
        module_file.position,
        module_file.title,
        module_file.summary_markdown,
        [o.model_dump() for o in module_file.objectives],
    )
    if module.content_hash != digest:
        module.position = module_file.position
        module.title = module_file.title
        module.summary_markdown = module_file.summary_markdown
        module.objectives = [o.model_dump(mode="json") for o in module_file.objectives]
        module.content_hash = digest

    await db.flush()
    return module


async def _sync_lesson(db: AsyncSession, lesson_file: LessonFile, module_id: int) -> int:
    """Upsert a lesson and its exercises; returns the number of exercises."""
    result = await db.execute(
        select(Lesson).where(Lesson.module_id == module_id, Lesson.slug == lesson_file.slug)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        lesson = Lesson(module_id=module_id, slug=lesson_file.slug)
        db.add(lesson)

    digest = content_hash(
        lesson_file.position,
        lesson_file.title,
        lesson_file.content_markdown,
        lesson_file.worked_example_code,
        lesson_file.worked_example_note,
    )
    if lesson.content_hash != digest:
        lesson.position = lesson_file.position
        lesson.title = lesson_file.title
        lesson.content_markdown = lesson_file.content_markdown
        lesson.worked_example_code = lesson_file.worked_example_code
        lesson.worked_example_note = lesson_file.worked_example_note
        lesson.content_hash = digest

    await db.flush()

    count = 0
    for exercise_file in lesson_file.exercises:
        existing = await db.execute(
            select(Exercise).where(
                Exercise.lesson_id == lesson.id, Exercise.slug == exercise_file.slug
            )
        )
        exercise = existing.scalar_one_or_none()
        if exercise is None:
            exercise = Exercise(lesson_id=lesson.id, slug=exercise_file.slug)
            db.add(exercise)

        checks = harness_payload(exercise_file)
        digest = content_hash(
            exercise_file.position,
            exercise_file.title,
            exercise_file.prompt_markdown,
            exercise_file.starter_code,
            checks,
            exercise_file.stdin,
            exercise_file.files,
            exercise_file.packages,
            exercise_file.hints,
            exercise_file.rubric,
            exercise_file.scaffold_level.value,
            exercise_file.bloom.value,
        )
        if exercise.content_hash != digest:
            exercise.position = exercise_file.position
            exercise.title = exercise_file.title
            exercise.prompt_markdown = exercise_file.prompt_markdown
            exercise.starter_code = exercise_file.starter_code
            exercise.test_cases = checks
            exercise.stdin = list(exercise_file.stdin)
            exercise.files = dict(exercise_file.files)
            exercise.packages = list(exercise_file.packages)
            exercise.hints = list(exercise_file.hints)
            exercise.rubric = list(exercise_file.rubric)
            exercise.scaffold_level = exercise_file.scaffold_level.value
            exercise.bloom = exercise_file.bloom.value
            exercise.content_hash = digest

        count += 1

    await db.flush()
    return count


async def _sync_quiz(db: AsyncSession, module_file: ModuleFile, module_id: int) -> int:
    count = 0
    for item_file in module_file.quiz:
        result = await db.execute(
            select(QuizItem).where(QuizItem.module_id == module_id, QuizItem.slug == item_file.slug)
        )
        item = result.scalar_one_or_none()
        if item is None:
            item = QuizItem(module_id=module_id, slug=item_file.slug)
            db.add(item)

        digest = content_hash(item_file.model_dump(mode="json"))
        if item.content_hash != digest:
            item.position = item_file.position
            item.kind = item_file.kind
            item.prompt_markdown = item_file.prompt_markdown
            item.code = item_file.code
            item.options = list(item_file.options)
            item.answer = item_file.answer
            item.explanation_markdown = item_file.explanation_markdown
            item.reviews_module_slug = item_file.reviews_module_slug
            item.content_hash = digest
        count += 1

    await db.flush()
    return count


async def main(content_dir: Path | None = None) -> int:
    settings = get_settings()
    directory = content_dir or settings.content_dir

    try:
        curriculum = load_curriculum(directory)
    except ContentError as exc:
        print(f"Content is not loadable:\n{exc}")
        return 1

    factory = get_session_factory()
    async with factory() as db:
        stats = await sync_curriculum(db, curriculum)
        await db.commit()

    await dispose_engine()
    print(
        "Loaded "
        + ", ".join(f"{count} {name.replace('_', ' ')}" for name, count in stats.items())
        + f" from {directory}."
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load curriculum content into the database.")
    parser.add_argument("--content-dir", type=Path, default=None)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args.content_dir)))
