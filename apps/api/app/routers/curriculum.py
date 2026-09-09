"""Read-only curriculum delivery.

A note on "hidden" test cases (brief §4.3)
------------------------------------------
An exercise's checks are sent to the browser, because grading happens in the
browser — that is a direct, unavoidable consequence of the in-browser execution
model in Section 4.1, not an oversight. A learner who opens developer tools can
read the checks for the exercise they are on.

This is the right trade for a self-directed learning platform: there is no
credential to game, so the only person affected by looking is the learner. What
is *not* exposed is the reference solution, which is never loaded into the
database, and quiz answers, which are checked server-side.

If the platform ever issues an assessment that matters — a certificate, a course
grade — that is the point at which this stops being acceptable, and it is the
same trigger Section 4.1 names for revisiting the sandboxing model. Recorded
here rather than discovered later.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Exercise, Lesson, Module, QuizItem, Track
from app.schemas import (
    ExerciseOut,
    LessonOut,
    LessonSummary,
    ModuleOut,
    ModuleSummary,
    QuizItemOut,
    TrackOut,
)

router = APIRouter(prefix="/api/curriculum", tags=["curriculum"])


async def _lesson_counts(db: AsyncSession, module_ids: list[int]) -> dict[int, int]:
    if not module_ids:
        return {}
    result = await db.execute(
        select(Lesson.module_id, func.count(Lesson.id))
        .where(Lesson.module_id.in_(module_ids))
        .group_by(Lesson.module_id)
    )
    return dict(result.all())  # type: ignore[arg-type]


@router.get("/tracks", response_model=list[TrackOut])
async def list_tracks(db: AsyncSession = Depends(get_db)) -> list[TrackOut]:
    result = await db.execute(
        select(Track).options(selectinload(Track.modules)).order_by(Track.position)
    )
    tracks = result.scalars().all()

    counts = await _lesson_counts(db, [m.id for t in tracks for m in t.modules])

    return [
        TrackOut(
            id=track.id,
            slug=track.slug,
            position=track.position,
            title=track.title,
            summary_markdown=track.summary_markdown,
            prerequisite_slug=track.prerequisite_slug,
            modules=[
                ModuleSummary(
                    id=module.id,
                    slug=module.slug,
                    position=module.position,
                    title=module.title,
                    summary_markdown=module.summary_markdown,
                    lesson_count=counts.get(module.id, 0),
                )
                for module in track.modules
            ],
        )
        for track in tracks
    ]


@router.get("/modules/{module_slug}", response_model=ModuleOut)
async def get_module(module_slug: str, db: AsyncSession = Depends(get_db)) -> ModuleOut:
    result = await db.execute(
        select(Module).options(selectinload(Module.lessons)).where(Module.slug == module_slug)
    )
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such module.")

    counts = await db.execute(
        select(Exercise.lesson_id, func.count(Exercise.id))
        .where(Exercise.lesson_id.in_([lesson.id for lesson in module.lessons] or [0]))
        .group_by(Exercise.lesson_id)
    )
    exercise_counts: dict[int, int] = dict(counts.all())  # type: ignore[arg-type]

    return ModuleOut(
        id=module.id,
        slug=module.slug,
        position=module.position,
        title=module.title,
        summary_markdown=module.summary_markdown,
        objectives=module.objectives,  # type: ignore[arg-type]
        lessons=[
            LessonSummary(
                id=lesson.id,
                slug=lesson.slug,
                position=lesson.position,
                title=lesson.title,
                exercise_count=exercise_counts.get(lesson.id, 0),
            )
            for lesson in module.lessons
        ],
    )


@router.get("/modules/{module_slug}/lessons/{lesson_slug}", response_model=LessonOut)
async def get_lesson(
    module_slug: str, lesson_slug: str, db: AsyncSession = Depends(get_db)
) -> LessonOut:
    result = await db.execute(
        select(Lesson)
        .join(Module)
        .options(selectinload(Lesson.exercises))
        .where(Module.slug == module_slug, Lesson.slug == lesson_slug)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such lesson.")

    return LessonOut(
        id=lesson.id,
        slug=lesson.slug,
        position=lesson.position,
        title=lesson.title,
        content_markdown=lesson.content_markdown,
        worked_example_code=lesson.worked_example_code,
        worked_example_note=lesson.worked_example_note,
        exercises=[ExerciseOut.model_validate(exercise) for exercise in lesson.exercises],
    )


@router.get("/modules/{module_slug}/quiz", response_model=list[QuizItemOut])
async def get_quiz(module_slug: str, db: AsyncSession = Depends(get_db)) -> list[QuizItem]:
    result = await db.execute(
        select(QuizItem).join(Module).where(Module.slug == module_slug).order_by(QuizItem.position)
    )
    return list(result.scalars().all())
