"""Progress and submissions.

Module status is derived from lesson rows rather than stored, so a module can
never be marked complete while one of its lessons is not.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_db
from app.learner import completed_module_ids, due_review_items, practice_streak
from app.models import Exercise, Lesson, Module, Progress, Submission, User
from app.schemas import (
    ModuleProgressOut,
    ProgressOut,
    ProgressUpdate,
    SubmissionOut,
    SubmissionRequest,
    SummaryOut,
)

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("", response_model=list[ProgressOut])
async def list_progress(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ProgressOut]:
    result = await db.execute(
        select(Progress, Lesson.slug, Module.slug)
        .join(Lesson, Lesson.id == Progress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Progress.user_id == user.id)
    )
    return [
        ProgressOut(
            lesson_slug=lesson_slug,
            module_slug=module_slug,
            status=row.status,
            completed_at=row.completed_at,
        )
        for row, lesson_slug, module_slug in result.all()
    ]


@router.get("/modules", response_model=list[ModuleProgressOut])
async def module_progress(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ModuleProgressOut]:
    lessons = await db.execute(
        select(Module.slug, Lesson.id, Module.position)
        .join(Lesson, Lesson.module_id == Module.id)
        .order_by(Module.position, Lesson.position)
    )
    rows = lessons.all()

    completed = await db.execute(
        select(Progress.lesson_id).where(
            Progress.user_id == user.id, Progress.status == "completed"
        )
    )
    completed_ids = set(completed.scalars().all())

    started = await db.execute(select(Progress.lesson_id).where(Progress.user_id == user.id))
    started_ids = set(started.scalars().all())

    totals: dict[str, list[int]] = {}
    for module_slug, lesson_id, _ in rows:
        totals.setdefault(module_slug, []).append(lesson_id)

    output: list[ModuleProgressOut] = []
    for module_slug, lesson_ids in totals.items():
        done = sum(1 for lesson_id in lesson_ids if lesson_id in completed_ids)
        touched = any(lesson_id in started_ids for lesson_id in lesson_ids)
        module_status = (
            "completed"
            if done == len(lesson_ids)
            else ("in_progress" if touched else "not_started")
        )
        output.append(
            ModuleProgressOut(
                module_slug=module_slug,
                total_lessons=len(lesson_ids),
                completed_lessons=done,
                status=module_status,  # type: ignore[arg-type]
            )
        )
    return output


@router.put("/lessons/{module_slug}/{lesson_slug}", response_model=ProgressOut)
async def set_lesson_progress(
    module_slug: str,
    lesson_slug: str,
    body: ProgressUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> ProgressOut:
    result = await db.execute(
        select(Lesson).join(Module).where(Module.slug == module_slug, Lesson.slug == lesson_slug)
    )
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such lesson.")

    existing = await db.execute(
        select(Progress).where(Progress.user_id == user.id, Progress.lesson_id == lesson.id)
    )
    row = existing.scalar_one_or_none()
    if row is None:
        row = Progress(user_id=user.id, lesson_id=lesson.id, status=body.status)
        db.add(row)
    else:
        row.status = body.status

    # Completion time is set once and never moved by a revisit: a learner
    # rereading a finished lesson has not un-finished it.
    if body.status == "completed" and row.completed_at is None:
        row.completed_at = datetime.now(UTC)
    elif body.status != "completed":
        row.completed_at = None

    await db.flush()
    return ProgressOut(
        lesson_slug=lesson_slug,
        module_slug=module_slug,
        status=row.status,  # type: ignore[arg-type]
        completed_at=row.completed_at,
    )


@router.get("/summary", response_model=SummaryOut)
async def summary(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> SummaryOut:
    """Recognition of work done, and nothing else.

    Section 6 asks for streaks and module badges, and asks in the same sentence
    that they stay understated and free of dark patterns. The way to honour both
    is to report only facts the learner produced — days practised, exercises
    passed, modules finished — and leave the interface free to say nothing at
    all when there is nothing to report. There is no goal here to fall short of.
    """
    streak_days, last_practised_on = await practice_streak(db, user.id)

    passed = await db.execute(
        select(func.count(func.distinct(Submission.exercise_id))).where(
            Submission.user_id == user.id, Submission.passed.is_(True)
        )
    )

    completed = await completed_module_ids(db, user.id)
    slugs = await db.execute(
        select(Module.slug).where(Module.id.in_(completed)).order_by(Module.position)
    )

    # The queue is capped at a sitting's worth, so counting the rows it would
    # return is both cheap and the number we want to show: see REVIEW_BATCH_SIZE.
    due = await due_review_items(db, user.id)

    return SummaryOut(
        streak_days=streak_days,
        last_practised_on=last_practised_on,
        exercises_passed=passed.scalar_one(),
        completed_module_slugs=list(slugs.scalars().all()),
        reviews_due=len(due),
    )


@router.post("/submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def record_submission(
    body: SubmissionRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Submission:
    """Record an attempt.

    `passed` is reported by the browser, which is where grading runs. The server
    cannot independently verify it without executing learner code, which the
    architecture forbids. Submissions are therefore a record of practice, not an
    assessment — see the note in routers/curriculum.py. The submitted code is
    stored so a learner can see their own history and so authors can find
    exercises that trip people up.
    """
    result = await db.execute(select(Exercise).where(Exercise.slug == body.exercise_slug))
    exercise = result.scalars().first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such exercise.")

    submission = Submission(
        user_id=user.id,
        exercise_id=exercise.id,
        code=body.code,
        passed=body.passed,
    )
    db.add(submission)
    await db.flush()
    return submission
