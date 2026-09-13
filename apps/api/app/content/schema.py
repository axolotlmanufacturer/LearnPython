"""Validation schema for the curriculum files under `content/`.

Curriculum is data (Section 4.2 of the brief), authored as Markdown and YAML and
reviewed through pull requests. This module is what makes that safe: every file
is validated here at load time, so a malformed exercise fails CI rather than
reaching a learner.

The check vocabulary mirrors `Check` in apps/web/src/lib/python/types.ts. The two
are kept in step by the content tests, which run every authored exercise through
the real harness — a check shape this schema accepts but the harness cannot
evaluate would fail there.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Bloom(StrEnum):
    """Bloom's taxonomy level, per Section 2.5 — each module should move a
    learner through these in order."""

    REMEMBER = "remember"
    UNDERSTAND = "understand"
    APPLY = "apply"
    ANALYZE = "analyze"
    EVALUATE = "evaluate"
    CREATE = "create"


class ScaffoldLevel(StrEnum):
    """How much support an exercise gives.

    Section 2.2 (Zone of Proximal Development): support is withdrawn gradually as
    a learner demonstrates mastery. Listed here in the order they should appear
    within a lesson, which `validate_curriculum` checks.
    """

    PREDICT = "predict"  # read code, predict the output — no writing yet
    FILL_IN = "fill_in"  # complete a mostly-written program
    MODIFY = "modify"  # change working code to do something else
    DEBUG = "debug"  # find and fix a fault in given code
    WRITE_FROM_SPEC = "write_from_spec"  # write it from a description
    OPEN_ENDED = "open_ended"  # a small project, judged by rubric

    @property
    def rank(self) -> int:
        return _SCAFFOLD_ORDER.index(self)


_SCAFFOLD_ORDER = [
    ScaffoldLevel.PREDICT,
    ScaffoldLevel.FILL_IN,
    ScaffoldLevel.MODIFY,
    ScaffoldLevel.DEBUG,
    ScaffoldLevel.WRITE_FROM_SPEC,
    ScaffoldLevel.OPEN_ENDED,
]


class StrictModel(BaseModel):
    """Reject unknown keys, so a typo in a content file is an error rather than
    a silently ignored field."""

    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------ checks


class StdoutCheck(StrictModel):
    kind: Literal["stdout"] = "stdout"
    label: str
    expected: str
    match: Literal["exact", "normalized", "contains"] = "normalized"


class CallCheck(StrictModel):
    kind: Literal["call"]
    label: str
    function: str
    args: list[Any] = Field(default_factory=list)
    kwargs: dict[str, Any] = Field(default_factory=dict)
    # Omitting `expected` means "assert the result is truthy"; writing
    # `expected: null` means "assert the result is None". The two are told apart
    # by whether the key was present in the file, so this must not be given a
    # meaningful default. See `harness_payload` in loader.py.
    expected: Any = None
    tolerance: float | None = None


class ExprCheck(StrictModel):
    kind: Literal["expr"]
    label: str
    expression: str
    # Same convention as CallCheck.expected — see the note there.
    expected: Any = None
    tolerance: float | None = None


class SourceCheck(StrictModel):
    kind: Literal["source"]
    label: str
    require_ast: list[str] = Field(default_factory=list)
    forbid_ast: list[str] = Field(default_factory=list)
    require_text: list[str] = Field(default_factory=list)
    forbid_text: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def at_least_one_constraint(self) -> SourceCheck:
        if not (self.require_ast or self.forbid_ast or self.require_text or self.forbid_text):
            raise ValueError("a source check must constrain something")
        return self


class FileCheck(StrictModel):
    """Check what the program wrote to a file. Needed from Module 8 onward, where
    the observable result of an exercise is a file rather than printed output."""

    kind: Literal["file"]
    label: str
    path: str
    expected: str
    match: Literal["exact", "normalized", "contains"] = "normalized"


Check = Annotated[
    StdoutCheck | CallCheck | ExprCheck | SourceCheck | FileCheck,
    Field(discriminator="kind"),
]


# --------------------------------------------------------------- entities


class Objective(StrictModel):
    text: str
    bloom: Bloom


#: Pyodide packages an exercise may declare.
#:
#: An allow-list rather than free text, for two reasons. The small one is typos:
#: `panadas` would otherwise fail at a learner's keystroke rather than in CI. The
#: real one is that each entry is a **bandwidth decision**. These wheels are the
#: largest thing the platform serves after the interpreter itself — scipy alone
#: exceeds it — so adding one should require editing this list and saying why,
#: not just typing a name into an exercise.
#:
#: That these names exist in the interpreter we actually ship is checked
#: separately, web-side, against `pyodide-lock.json`; this list cannot verify
#: itself. See docs/spike-scientific-stack.md.
ALLOWED_PACKAGES = {
    # Tabular data. Track B Module 11 onwards.
    "pandas",
    # numpy arrives as a pandas dependency, but an exercise that uses it
    # directly should say so rather than relying on that.
    "numpy",
    # Statistical tests. Deliberately not introduced until a learner has
    # computed the same thing by hand (Module 13).
    "scipy",
}


class ExerciseFile(StrictModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    lesson: str
    position: int = Field(ge=1)
    title: str
    bloom: Bloom = Bloom.APPLY
    scaffold_level: ScaffoldLevel
    prompt_markdown: str
    starter_code: str = ""
    stdin: list[str] = Field(default_factory=list)
    # Files placed in the run's working directory before the learner's code runs,
    # so an exercise can hand them something to read. Each run gets a fresh
    # directory, so nothing leaks between exercises.
    files: dict[str, str] = Field(default_factory=dict)
    checks: list[Check] = Field(min_length=1)
    # Pyodide packages this exercise needs, e.g. ["pandas"]. Loaded on demand
    # from the interpreter's own origin, per exercise rather than per track, so
    # a learner pays for scipy at the moment a test stops being something they
    # compute by hand. See docs/spike-scientific-stack.md §3.
    packages: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    # Criteria a learner judges their own work against, for the parts of an
    # open-ended project that automated checks cannot see — structure, naming,
    # handling the failures they chose to anticipate. Section 6, feature 10.
    rubric: list[str] = Field(default_factory=list)
    # Never loaded into the database and never served: it exists so the content
    # tests can prove the exercise is solvable as written (Section 10).
    solution_code: str

    @field_validator("packages")
    @classmethod
    def packages_are_allowed(cls, packages: list[str]) -> list[str]:
        unknown = sorted(set(packages) - ALLOWED_PACKAGES)
        if unknown:
            raise ValueError(
                f"{', '.join(unknown)} not in ALLOWED_PACKAGES. Adding one is a bandwidth "
                f"decision — see the note on that list in content/schema.py. "
                f"Currently allowed: {', '.join(sorted(ALLOWED_PACKAGES))}"
            )
        return packages

    @field_validator("hints")
    @classmethod
    def hints_are_progressive(cls, hints: list[str]) -> list[str]:
        if len(hints) > 4:
            raise ValueError("more than four hints is a sign the exercise is doing too much")
        return hints


class LessonFile(StrictModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    position: int = Field(ge=1)
    title: str
    content_markdown: str
    # Section 2.1, the worked-example effect: a worked example precedes
    # independent practice.
    worked_example_code: str | None = None
    worked_example_note: str | None = None
    exercises: list[ExerciseFile] = Field(default_factory=list)


class QuizItemFile(StrictModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    position: int = 0
    kind: Literal["multiple_choice", "predict_output"] = "multiple_choice"
    prompt_markdown: str
    code: str | None = None
    options: list[str] = Field(default_factory=list)
    answer: str
    explanation_markdown: str = ""
    reviews_module_slug: str | None = None

    @model_validator(mode="after")
    def answer_is_among_options(self) -> QuizItemFile:
        if self.kind == "multiple_choice":
            if len(self.options) < 2:
                raise ValueError("a multiple-choice item needs at least two options")
            if self.answer not in self.options:
                raise ValueError(f"answer {self.answer!r} is not one of the options")
        return self


class ModuleFile(StrictModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    track: str
    position: int = Field(ge=0)
    title: str
    summary_markdown: str = ""
    objectives: list[Objective] = Field(min_length=1)
    lessons: list[LessonFile] = Field(default_factory=list)
    quiz: list[QuizItemFile] = Field(default_factory=list)


class TrackFile(StrictModel):
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    position: int = Field(ge=1)
    title: str
    summary_markdown: str = ""
    prerequisite_slug: str | None = None


class Curriculum(StrictModel):
    tracks: list[TrackFile]
    modules: list[ModuleFile]


# ------------------------------------------------------- structural checks


def validate_curriculum(curriculum: Curriculum) -> list[str]:
    """Check the properties the brief requires *across* files.

    Returns a list of human-readable problems; empty means the curriculum is
    structurally sound. These are pedagogical invariants as much as data
    integrity ones, which is why they live here and are asserted in CI rather
    than left to reviewer diligence.
    """
    problems: list[str] = []
    track_slugs = {t.slug for t in curriculum.tracks}

    # Exercise slugs are only unique *within a lesson* (see the model's
    # UniqueConstraint), but Submission lookups and progress tracking find an
    # exercise by slug alone, with nothing to disambiguate. Two lessons reusing
    # the same slug would make a learner's submission silently attach to the
    # wrong exercise. Global uniqueness is stricter than the schema requires,
    # but it is what makes that lookup safe, so it is enforced here.
    seen_exercise_slugs: dict[str, str] = {}
    for module in curriculum.modules:
        for lesson in module.lessons:
            for exercise in lesson.exercises:
                where = f"module '{module.slug}' lesson '{lesson.slug}'"
                if exercise.slug in seen_exercise_slugs:
                    problems.append(
                        f"{where} exercise '{exercise.slug}' reuses a slug already used at "
                        f"{seen_exercise_slugs[exercise.slug]} — exercise slugs must be "
                        f"unique across the whole curriculum, not just within a lesson"
                    )
                else:
                    seen_exercise_slugs[exercise.slug] = where

    for track in curriculum.tracks:
        if track.prerequisite_slug and track.prerequisite_slug not in track_slugs:
            problems.append(
                f"track '{track.slug}' names unknown prerequisite '{track.prerequisite_slug}'"
            )

    seen_module_positions: dict[str, set[int]] = {}
    module_slugs = {m.slug for m in curriculum.modules}

    for module in curriculum.modules:
        where = f"module '{module.slug}'"

        if module.track not in track_slugs:
            problems.append(f"{where} belongs to unknown track '{module.track}'")

        positions = seen_module_positions.setdefault(module.track, set())
        if module.position in positions:
            problems.append(f"{where} reuses position {module.position} within its track")
        positions.add(module.position)

        if not module.lessons:
            problems.append(f"{where} has no lessons")

        lesson_positions = [lesson.position for lesson in module.lessons]
        if len(set(lesson_positions)) != len(lesson_positions):
            problems.append(f"{where} has lessons with duplicate positions")

        for lesson in module.lessons:
            problems.extend(_validate_lesson(module, lesson))

        for item in module.quiz:
            if item.reviews_module_slug and item.reviews_module_slug not in module_slugs:
                problems.append(
                    f"{where} quiz item '{item.slug}' reviews unknown module "
                    f"'{item.reviews_module_slug}'"
                )

        # Section 2.4 and Section 5: a module's quiz must resurface earlier
        # material, not only test what was just taught. Module 0 has nothing
        # earlier to draw on.
        if module.position > 0 and module.quiz:
            revisits = [i for i in module.quiz if i.reviews_module_slug not in (None, module.slug)]
            if not revisits:
                problems.append(
                    f"{where} quiz does not revisit any earlier module "
                    f"(spaced repetition, Section 2.4)"
                )

    return problems


def _validate_lesson(module: ModuleFile, lesson: LessonFile) -> list[str]:
    problems: list[str] = []
    where = f"module '{module.slug}' lesson '{lesson.slug}'"

    exercise_positions = [ex.position for ex in lesson.exercises]
    if len(set(exercise_positions)) != len(exercise_positions):
        problems.append(f"{where} has exercises with duplicate positions")

    ordered = sorted(lesson.exercises, key=lambda ex: ex.position)

    # Section 2.2: scaffolding is withdrawn, never re-applied mid-lesson.
    ranks = [ex.scaffold_level.rank for ex in ordered]
    if ranks != sorted(ranks):
        sequence = " → ".join(ex.scaffold_level.value for ex in ordered)
        problems.append(
            f"{where} withdraws then re-applies scaffolding ({sequence}); "
            f"support should only decrease within a lesson"
        )

    for exercise in ordered:
        if exercise.lesson != lesson.slug:
            problems.append(
                f"exercise '{exercise.slug}' claims lesson '{exercise.lesson}' "
                f"but is filed under '{lesson.slug}'"
            )
        if exercise.scaffold_level is ScaffoldLevel.FILL_IN and not exercise.starter_code.strip():
            problems.append(
                f"{where} exercise '{exercise.slug}' is fill_in but has no starter code"
            )
        if exercise.scaffold_level is ScaffoldLevel.DEBUG and not exercise.starter_code.strip():
            problems.append(f"{where} exercise '{exercise.slug}' is debug but has no code to debug")

    return problems
