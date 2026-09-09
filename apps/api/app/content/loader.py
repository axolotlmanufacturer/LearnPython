"""Read the curriculum from `content/` and validate it.

Layout, one directory per module::

    content/
      tracks.yaml
      track-a/
        00-orientation/
          module.yaml
          lessons/01-what-is-code.md      Markdown body, YAML front matter
          exercises/01-say-hello.yaml
          quiz.yaml                        (optional)

Lessons are Markdown because they are prose, and prose belongs in a format that
reads well in a pull request. Exercises are YAML because they are structured
data — code, checks, hints — with only the prompt as prose.

Nothing here touches the database; `load.py` does that. Keeping the two apart is
what lets the content tests and CI validate the curriculum without a database.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import frontmatter
import yaml
from pydantic import ValidationError

from app.content.schema import (
    Curriculum,
    ExerciseFile,
    LessonFile,
    ModuleFile,
    QuizItemFile,
    TrackFile,
    validate_curriculum,
)


class ContentError(Exception):
    """A curriculum file is missing, malformed, or structurally inconsistent."""


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ContentError(f"{path}: invalid YAML — {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ContentError(f"{path}: expected a mapping at the top level")
    return data


def _fail(path: Path, exc: ValidationError) -> ContentError:
    lines = [f"{path}:"]
    for error in exc.errors():
        location = ".".join(str(part) for part in error["loc"]) or "(root)"
        lines.append(f"  {location}: {error['msg']}")
    return ContentError("\n".join(lines))


def load_lesson(path: Path) -> LessonFile:
    """Parse one lesson: YAML front matter plus a Markdown body."""
    post = frontmatter.load(str(path))
    data = dict(post.metadata)
    data["content_markdown"] = post.content.strip() + "\n"
    data.setdefault("slug", path.stem.split("-", 1)[-1])
    try:
        return LessonFile.model_validate(data)
    except ValidationError as exc:
        raise _fail(path, exc) from exc


def load_exercise(path: Path) -> ExerciseFile:
    data = _read_yaml(path)
    data.setdefault("slug", path.stem.split("-", 1)[-1])
    try:
        return ExerciseFile.model_validate(data)
    except ValidationError as exc:
        raise _fail(path, exc) from exc


def load_module(directory: Path) -> ModuleFile:
    module_path = directory / "module.yaml"
    if not module_path.exists():
        raise ContentError(f"{directory}: no module.yaml")

    data = _read_yaml(module_path)
    data.setdefault("slug", directory.name.split("-", 1)[-1])

    lessons_dir = directory / "lessons"
    lessons = [load_lesson(p) for p in sorted(lessons_dir.glob("*.md"))]

    exercises_dir = directory / "exercises"
    exercises = [load_exercise(p) for p in sorted(exercises_dir.glob("*.yaml"))]

    by_lesson: dict[str, list[ExerciseFile]] = {}
    for exercise in exercises:
        by_lesson.setdefault(exercise.lesson, []).append(exercise)

    known = {lesson.slug for lesson in lessons}
    for lesson_slug in by_lesson:
        if lesson_slug not in known:
            raise ContentError(
                f"{exercises_dir}: exercises reference lesson '{lesson_slug}', "
                f"which does not exist in {lessons_dir}"
            )

    for lesson in lessons:
        lesson.exercises = sorted(by_lesson.get(lesson.slug, []), key=lambda ex: ex.position)

    data["lessons"] = [lesson.model_dump() for lesson in sorted(lessons, key=lambda x: x.position)]

    quiz_path = directory / "quiz.yaml"
    if quiz_path.exists():
        raw = _read_yaml(quiz_path)
        items = raw.get("items", [])
        try:
            data["quiz"] = [QuizItemFile.model_validate(item).model_dump() for item in items]
        except ValidationError as exc:
            raise _fail(quiz_path, exc) from exc

    try:
        return ModuleFile.model_validate(data)
    except ValidationError as exc:
        raise _fail(module_path, exc) from exc


def load_curriculum(content_dir: Path) -> Curriculum:
    """Load and validate the whole curriculum. Raises `ContentError` on any problem."""
    tracks_path = content_dir / "tracks.yaml"
    if not tracks_path.exists():
        raise ContentError(f"{tracks_path}: not found")

    raw_tracks = _read_yaml(tracks_path).get("tracks", [])
    try:
        tracks = [TrackFile.model_validate(t) for t in raw_tracks]
    except ValidationError as exc:
        raise _fail(tracks_path, exc) from exc

    modules: list[ModuleFile] = []
    for track in sorted(tracks, key=lambda t: t.position):
        track_dir = content_dir / track.slug
        if not track_dir.is_dir():
            continue  # A track may be declared before its content is authored.
        for module_dir in sorted(p for p in track_dir.iterdir() if p.is_dir()):
            modules.append(load_module(module_dir))

    curriculum = Curriculum(tracks=tracks, modules=modules)

    problems = validate_curriculum(curriculum)
    if problems:
        raise ContentError("Curriculum is not structurally sound:\n  - " + "\n  - ".join(problems))

    return curriculum


# ---------------------------------------------------------------- helpers


def harness_payload(exercise: ExerciseFile) -> list[dict[str, Any]]:
    """Convert an exercise's checks into the JSON harness.py evaluates.

    The one subtlety: `expected` is dropped when the author did not write it, so
    the harness falls back to a truthiness assertion. An author who genuinely
    wants to assert `None` writes `expected: null`, which *is* recorded as set.
    """
    payload: list[dict[str, Any]] = []
    for check in exercise.checks:
        data = check.model_dump(exclude_none=False)
        if check.kind in {"call", "expr"} and "expected" not in check.model_fields_set:
            data.pop("expected", None)
        # Tolerance is only meaningful when given.
        if data.get("tolerance") is None:
            data.pop("tolerance", None)
        payload.append(data)
    return payload


def content_hash(*parts: Any) -> str:
    """Stable hash of a record's authored content, for idempotent reloads."""
    digest = hashlib.sha256()
    digest.update(json.dumps(parts, sort_keys=True, default=str).encode("utf-8"))
    return digest.hexdigest()
