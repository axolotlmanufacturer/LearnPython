"""Queries over one learner's own rows.

Everything here is *derived* rather than stored — which modules are finished, how
many days in a row the learner has practised, which quiz items are due. A stored
counter is a second source of truth that drifts the first time an update is
missed; a derived one cannot disagree with the rows it is derived from. This is
the same reasoning that keeps module status out of the schema
(docs/architecture.md §4).

Shared by the progress and quiz routers, which ask the same questions for
different reasons: the quiz router renders the due items, the progress summary
counts them.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import Row, Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Lesson, Module, Progress, QuizAttempt, QuizItem, Submission

#: Upper bound on the streak query. Longer than any plausible streak, and it
#: keeps the row count bounded for an account that has been active for years.
MAX_STREAK_DAYS = 400

#: How many items one review sitting may hold.
#:
#: Retrieval practice works because it is short and frequent. A queue that shows
#: everything outstanding turns a two-minute warm-up into a backlog, and a
#: backlog is something learners avoid rather than clear. The cap is applied to
#: the count reported to the interface as well as to the queue itself, so a
#: learner returning after a long break is shown a sitting's worth of work and
#: not a number designed to make them feel behind.
REVIEW_BATCH_SIZE = 10


async def completed_module_ids(db: AsyncSession, user_id: int) -> set[int]:
    """Modules in which every lesson is marked completed."""
    result = await db.execute(
        select(Lesson.module_id)
        .outerjoin(
            Progress,
            and_(
                Progress.lesson_id == Lesson.id,
                Progress.user_id == user_id,
                Progress.status == "completed",
            ),
        )
        .group_by(Lesson.module_id)
        # count() ignores NULLs, so this is "every lesson has a completed row".
        .having(func.count(Lesson.id) == func.count(Progress.id))
    )
    return set(result.scalars().all())


async def practice_streak(
    db: AsyncSession, user_id: int, *, today: date | None = None
) -> tuple[int, date | None]:
    """Consecutive days of practice ending today or yesterday, and the last one.

    Two deliberate choices:

    *Every* submission counts, passing or failing. Counting only successes would
    quietly penalise the learner who spent an evening stuck on one exercise —
    which is precisely the productive struggle Section 2.6 asks us to make safe,
    and the last thing to attach a penalty to.

    Yesterday still counts as current, so the streak does not appear to vanish
    between midnight and the day's first exercise. That grace also absorbs the
    timezone error below.

    Days are UTC. The server does not know the learner's timezone, and asking
    for it to sharpen a decorative number is not a trade worth making.
    """
    day = func.date(func.timezone("UTC", Submission.submitted_at))
    result = await db.execute(
        select(day)
        .where(Submission.user_id == user_id)
        .group_by(day)
        .order_by(day.desc())
        .limit(MAX_STREAK_DAYS)
    )
    days: list[date] = list(result.scalars().all())
    if not days:
        return 0, None

    last = days[0]
    if ((today or datetime.now(UTC).date()) - last).days > 1:
        return 0, last

    streak = 1
    for index in range(1, len(days)):
        if (days[index - 1] - days[index]).days != 1:
            break
        streak += 1
    return streak, last


def latest_attempts(user_id: int) -> Select[Any]:
    """One row per quiz item: the learner's most recent attempt at it.

    `DISTINCT ON` is PostgreSQL-specific, which is the engine this runs on in
    development, CI, and production. The alternative — reading every attempt and
    folding them in Python — grows with the learner's whole history to answer a
    question about at most a few dozen items.
    """
    return (
        select(
            QuizAttempt.quiz_item_id.label("quiz_item_id"),
            QuizAttempt.due_at.label("due_at"),
            QuizAttempt.interval_days.label("interval_days"),
        )
        .where(QuizAttempt.user_id == user_id)
        .distinct(QuizAttempt.quiz_item_id)
        .order_by(
            QuizAttempt.quiz_item_id,
            QuizAttempt.attempted_at.desc(),
            # Two attempts within the same clock tick would otherwise pick
            # arbitrarily; the higher id is the later one.
            QuizAttempt.id.desc(),
        )
    )


async def previous_interval(db: AsyncSession, user_id: int, quiz_item_id: int) -> int | None:
    """The interval the learner's last attempt at this item scheduled, if any."""
    result = await db.execute(
        latest_attempts(user_id).where(QuizAttempt.quiz_item_id == quiz_item_id)
    )
    row = result.first()
    return int(row.interval_days) if row is not None else None


async def due_review_items(
    db: AsyncSession, user_id: int, *, now: datetime | None = None
) -> list[Row[Any]]:
    """What this learner should be asked next: `(QuizItem, module_slug, module_title, attempted)`.

    Two sources, combined:

    *Overdue reviews* — items already attempted whose scheduled time has passed.

    *New items from completed modules.* A module's quiz is its review, so it
    becomes available when the module is finished, not while it is in progress.
    Surfacing an item mid-module would ask about lessons the learner has not
    reached yet, which is the opposite of working inside the zone of proximal
    development (Section 2.2) — and a beginner cannot tell "I have not been
    taught this" from "I have failed to learn this".

    Overdue material is ordered first, most overdue first: it is the material
    closest to being forgotten, and the whole point of the schedule is to catch
    it just before that happens.
    """
    latest = latest_attempts(user_id).subquery("latest")
    completed = await completed_module_ids(db, user_id)

    result = await db.execute(
        select(QuizItem, Module.slug, Module.title, latest.c.quiz_item_id)
        .join(Module, Module.id == QuizItem.module_id)
        .outerjoin(latest, latest.c.quiz_item_id == QuizItem.id)
        .where(
            or_(
                latest.c.due_at <= (now or datetime.now(UTC)),
                and_(
                    # Never attempted. Without this, answering an item would not
                    # take it out of the queue: every item in a finished module
                    # would qualify as "new" forever.
                    latest.c.quiz_item_id.is_(None),
                    # An empty set renders as a false constant, so a learner who
                    # has finished nothing simply gets no new items.
                    QuizItem.module_id.in_(completed),
                ),
            )
        )
        .order_by(
            # NULLs last puts never-attempted items after genuine reviews
            # without needing a CASE: an unattempted item has no due date.
            latest.c.due_at.asc().nulls_last(),
            Module.position,
            QuizItem.position,
        )
        .limit(REVIEW_BATCH_SIZE)
    )
    return list(result.all())
