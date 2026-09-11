"""The spaced-repetition review queue (Section 2.4, Section 6 feature 7).

Two endpoints, and the division of labour between them is the point:

  * `GET /due` decides *what* to ask, and never includes an answer.
  * `POST /attempts` decides *whether the answer was right*, on the server.

Grading quiz items on the server is a departure from exercises, which are graded
in the browser because that is where the Python interpreter lives. There is no
such constraint here — a quiz answer is a string comparison — so the answer
never has to leave the database before the learner has committed to one, and it
does not. See the note at the top of routers/curriculum.py for why that
distinction is worth keeping even on a platform that issues no assessment: an
answer visible in a network response would spoil a first attempt for someone who
was not trying to cheat, which is a different thing from being discoverable by
someone who goes looking.

Which items come back, and when, lives in app/learner.py and
app/spaced_repetition.py; this module is routing and grading.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_db
from app.learner import due_review_items, previous_interval
from app.models import QuizAttempt, QuizItem, User
from app.schemas import QuizAttemptRequest, QuizAttemptResponse, ReviewItemOut
from app.spaced_repetition import next_due_at, next_interval

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


@router.get("/due", response_model=list[ReviewItemOut])
async def due_items(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> list[ReviewItemOut]:
    """The next sitting's worth of retrieval practice, without the answers."""
    rows = await due_review_items(db, user.id)
    return [
        ReviewItemOut(
            id=item.id,
            slug=item.slug,
            kind=item.kind,
            prompt_markdown=item.prompt_markdown,
            code=item.code,
            options=list(item.options),
            module_slug=module_slug,
            module_title=module_title,
            reviews_module_slug=item.reviews_module_slug,
            seen_before=attempted_id is not None,
        )
        for item, module_slug, module_title, attempted_id in rows
    ]


@router.post("/attempts", response_model=QuizAttemptResponse, status_code=status.HTTP_201_CREATED)
async def record_attempt(
    body: QuizAttemptRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAttemptResponse:
    """Grade an answer, schedule the item's return, and explain the result.

    The explanation comes back whether the answer was right or wrong. Confirming
    a correct answer for the right reason is as much of the learning as
    correcting a wrong one — a learner who guessed and got it right has learned
    nothing from being told only "correct" (Section 2.3).
    """
    item = await db.get(QuizItem, body.quiz_item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such quiz item.")

    # An answer that is not on the list means the client sent something the
    # learner could not have chosen. Recording it as wrong would silently skew
    # their schedule; rejecting it surfaces the bug.
    if item.options and body.answer not in item.options:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That answer is not one of the options for this item.",
        )

    correct = body.answer == item.answer
    interval = next_interval(await previous_interval(db, user.id, item.id), correct)
    due = next_due_at(interval)

    db.add(
        QuizAttempt(
            user_id=user.id,
            quiz_item_id=item.id,
            correct=correct,
            interval_days=interval,
            due_at=due,
        )
    )
    await db.flush()

    return QuizAttemptResponse(
        correct=correct,
        answer=item.answer,
        explanation_markdown=item.explanation_markdown,
        interval_days=interval,
        next_due_at=due,
    )
