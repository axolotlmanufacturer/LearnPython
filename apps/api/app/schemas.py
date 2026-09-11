"""Request and response bodies for the API.

The important rule enforced here is what is *not* exposed: reference solutions
are never loaded into the database at all, and `password_hash` never leaves it.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------- auth


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORMModel):
    id: int
    email: str
    display_name: str | None
    created_at: datetime


# ------------------------------------------------------------- curriculum


class ObjectiveOut(BaseModel):
    text: str
    bloom: str


class ExerciseOut(ORMModel):
    """An exercise as the learner's browser receives it.

    The checks are included because grading happens in the browser — see the
    note in routers/curriculum.py. The reference solution is not, and is not in
    the database to begin with.
    """

    id: int
    slug: str
    position: int
    title: str
    prompt_markdown: str
    starter_code: str
    scaffold_level: str
    bloom: str
    hints: list[str]
    rubric: list[str]
    stdin: list[str]
    files: dict[str, str]
    checks: list[dict[str, Any]] = Field(validation_alias="test_cases")


class LessonOut(ORMModel):
    id: int
    slug: str
    position: int
    title: str
    content_markdown: str
    worked_example_code: str | None
    worked_example_note: str | None
    exercises: list[ExerciseOut] = Field(default_factory=list)


class LessonSummary(ORMModel):
    id: int
    slug: str
    position: int
    title: str
    exercise_count: int = 0


class ModuleOut(ORMModel):
    id: int
    slug: str
    position: int
    title: str
    summary_markdown: str
    objectives: list[ObjectiveOut]
    lessons: list[LessonSummary] = Field(default_factory=list)


class ModuleSummary(ORMModel):
    id: int
    slug: str
    position: int
    title: str
    summary_markdown: str
    lesson_count: int = 0


class TrackOut(ORMModel):
    id: int
    slug: str
    position: int
    title: str
    summary_markdown: str
    prerequisite_slug: str | None
    modules: list[ModuleSummary] = Field(default_factory=list)


class QuizItemOut(ORMModel):
    id: int
    slug: str
    kind: str
    prompt_markdown: str
    code: str | None
    options: list[str]
    reviews_module_slug: str | None
    # `answer` is deliberately absent: it is checked server-side, so a learner
    # cannot read it out of the response before answering.


# ------------------------------------------------------------------ review


class ReviewItemOut(BaseModel):
    """A quiz item surfaced by the spaced-repetition queue.

    Carries its module so the learner can see what is being revisited, and
    `seen_before` so the interface can say "again" rather than implying a
    first-time item is overdue. Like QuizItemOut, no answer.
    """

    id: int
    slug: str
    kind: str
    prompt_markdown: str
    code: str | None
    options: list[str]
    module_slug: str
    module_title: str
    reviews_module_slug: str | None
    seen_before: bool


class QuizAttemptRequest(BaseModel):
    # Addressed by id, not slug: quiz slugs are unique only within a module, and
    # the same recall item legitimately appears in more than one module's quiz.
    quiz_item_id: int
    answer: str


class QuizAttemptResponse(BaseModel):
    correct: bool
    answer: str
    explanation_markdown: str
    #: Days until this item is scheduled to come back.
    interval_days: int
    next_due_at: datetime


# --------------------------------------------------------------- progress


LessonStatus = Literal["not_started", "in_progress", "completed"]


class ProgressOut(BaseModel):
    lesson_slug: str
    module_slug: str
    status: LessonStatus
    completed_at: datetime | None


class ProgressUpdate(BaseModel):
    status: LessonStatus


class ModuleProgressOut(BaseModel):
    """Module status is derived from its lessons rather than stored, so the two
    cannot disagree."""

    module_slug: str
    total_lessons: int
    completed_lessons: int
    status: LessonStatus


class SubmissionRequest(BaseModel):
    exercise_slug: str
    code: str
    passed: bool


class SubmissionOut(ORMModel):
    id: int
    exercise_id: int
    passed: bool
    submitted_at: datetime


class SummaryOut(BaseModel):
    """The understated recognition of Section 6, feature 9.

    Everything here is a plain count of work already done. There is deliberately
    no "don't break your streak", no target to fall short of, and no comparison
    with anyone else: the interface shows a streak when there is one and says
    nothing at all when there is not (`streak_days` is 0).
    """

    streak_days: int
    last_practised_on: date | None
    exercises_passed: int
    #: Slugs of fully completed modules, in curriculum order.
    completed_module_slugs: list[str]
    #: Items waiting in the review queue, so the interface can offer it or not.
    reviews_due: int
