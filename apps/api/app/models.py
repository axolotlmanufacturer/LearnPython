"""Database schema.

Implements Section 7 of the brief, with the three additions recorded in
docs/architecture.md §4:

  * `Track`, because Section 5A introduces a second curriculum with a
    prerequisite relationship to the first, and adding the table now — while
    there is no data to migrate — is far cheaper than retrofitting it.
  * `slug` on every content entity, because curriculum lives in files and is
    loaded into the database. Integer ids are assigned at load time and are not
    stable across a reload, so content files reference each other, and URLs
    address lessons, by a human-authored key.
  * `content_hash`, so a reload is idempotent and can skip unchanged records.

One thing deliberately *not* stored here: reference solutions. They live only in
the content files, which the content tests read directly. Anything in the
database can be leaked by an API mistake; a solution that was never loaded cannot.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    # JSONB on Postgres, plain JSON elsewhere, so the same models work against
    # SQLite in a quick local test run.
    type_annotation_map = {dict[str, Any]: JSON().with_variant(JSONB, "postgresql")}


def _now_column() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


JsonType = JSON().with_variant(JSONB, "postgresql")


# ---------------------------------------------------------------- accounts


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Stored lowercased; the unique index is therefore case-insensitive in effect.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = _now_column()

    sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """An opaque server-side session.

    Only the hash of the token is stored, so a database disclosure does not hand
    an attacker usable sessions. Revocation is a row delete — the main practical
    advantage over the JWT flows an auth framework would have defaulted us into
    (docs/architecture.md §5).
    """

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = _now_column()

    user: Mapped[User] = relationship(back_populates="sessions")


# -------------------------------------------------------------- curriculum


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Slug of the track a learner is expected to have completed first, if any.
    prerequisite_slug: Mapped[str | None] = mapped_column(String(80), nullable=True)

    modules: Mapped[list[Module]] = relationship(
        back_populates="track", cascade="all, delete-orphan", order_by="Module.position"
    )


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (
        UniqueConstraint("track_id", "slug", name="uq_modules_track_slug"),
        Index("ix_modules_track_position", "track_id", "position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    track_id: Mapped[int] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # [{"text": "...", "bloom": "understand"}] — Bloom-tagged per Section 5.
    objectives: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, nullable=False, default=list)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    track: Mapped[Track] = relationship(back_populates="modules")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )
    quiz_items: Mapped[list[QuizItem]] = relationship(
        back_populates="module", cascade="all, delete-orphan"
    )


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("module_id", "slug", name="uq_lessons_module_slug"),
        Index("ix_lessons_module_position", "module_id", "position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    worked_example_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    worked_example_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    module: Mapped[Module] = relationship(back_populates="lessons")
    exercises: Mapped[list[Exercise]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", order_by="Exercise.position"
    )


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        UniqueConstraint("lesson_id", "slug", name="uq_exercises_lesson_slug"),
        Index("ix_exercises_lesson_position", "lesson_id", "position"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    prompt_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    starter_code: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # The check list evaluated by harness.py. Validated at load time against the
    # Pydantic schema in app/content/schema.py, so a malformed exercise fails the
    # content load in CI rather than at a learner's keystroke.
    test_cases: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, nullable=False, default=list)
    # Lines fed to input() during grading.
    stdin: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    # Files seeded into the run's working directory before the code runs.
    files: Mapped[dict[str, str]] = mapped_column(JsonType, nullable=False, default=dict)
    # Pyodide packages loaded before the code runs, e.g. ["pandas"]. Empty for
    # every Track A exercise; see docs/spike-scientific-stack.md.
    packages: Mapped[list[str]] = mapped_column(
        JsonType, nullable=False, default=list, server_default=text("'[]'")
    )
    # Ordered, revealed one at a time (Section 6, Phase 2 feature).
    hints: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    # Self-assessment criteria for open-ended work (Section 6, feature 10).
    rubric: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    # How much support this exercise gives; see ScaffoldLevel in content/schema.py.
    scaffold_level: Mapped[str] = mapped_column(
        String(32), nullable=False, default="write_from_spec"
    )
    bloom: Mapped[str] = mapped_column(String(24), nullable=False, default="apply")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    lesson: Mapped[Lesson] = relationship(back_populates="exercises")


class QuizItem(Base):
    """A retrieval-practice item, resurfaced on a spaced schedule (Section 2.4)."""

    __tablename__ = "quiz_items"
    __table_args__ = (UniqueConstraint("module_id", "slug", name="uq_quiz_items_module_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    module_id: Mapped[int] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # "multiple_choice" or "predict_output".
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="multiple_choice")
    prompt_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation_markdown: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Slug of the earlier module this item draws on, so a module's quiz can be
    # asserted to actually revisit prior material.
    reviews_module_slug: Mapped[str | None] = mapped_column(String(80), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    module: Mapped[Module] = relationship(back_populates="quiz_items")


# ------------------------------------------------------------ learner state


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_user_exercise", "user_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(Text, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_at: Mapped[datetime] = _now_column()


class Progress(Base):
    """Per-lesson progress. Module status is derived rather than stored, so the
    two can never disagree (docs/architecture.md §4)."""

    __tablename__ = "progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id", name="uq_progress_user_lesson"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    # "not_started" | "in_progress" | "completed"
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="in_progress")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (Index("ix_quiz_attempts_user_item", "user_id", "quiz_item_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_item_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_items.id", ondelete="CASCADE"), nullable=False
    )
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    attempted_at: Mapped[datetime] = _now_column()
    # Spaced-repetition state (Phase 5 uses it; recorded from the start so early
    # attempts are not lost).
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
