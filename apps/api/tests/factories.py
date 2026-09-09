"""Builders for a small on-disk curriculum, used by the loader and API tests.

Writing real files rather than constructing model objects directly means these
tests exercise the same path the real curriculum takes: parse, validate, load.
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from typing import Any

import yaml


def write_tracks(root: Path, tracks: list[dict[str, Any]] | None = None) -> None:
    tracks = tracks or [
        {"slug": "track-a", "position": 1, "title": "Python Fundamentals"},
    ]
    (root / "tracks.yaml").write_text(yaml.safe_dump({"tracks": tracks}), encoding="utf-8")


def write_module(
    root: Path,
    *,
    track: str = "track-a",
    directory: str = "00-orientation",
    slug: str = "orientation",
    position: int = 0,
    title: str = "Orientation",
    objectives: list[dict[str, str]] | None = None,
    quiz: list[dict[str, Any]] | None = None,
) -> Path:
    module_dir = root / track / directory
    (module_dir / "lessons").mkdir(parents=True, exist_ok=True)
    (module_dir / "exercises").mkdir(parents=True, exist_ok=True)

    (module_dir / "module.yaml").write_text(
        yaml.safe_dump(
            {
                "slug": slug,
                "track": track,
                "position": position,
                "title": title,
                "summary_markdown": f"About {title}.",
                "objectives": objectives or [{"text": "Run a program", "bloom": "understand"}],
            }
        ),
        encoding="utf-8",
    )

    if quiz is not None:
        (module_dir / "quiz.yaml").write_text(yaml.safe_dump({"items": quiz}), encoding="utf-8")

    return module_dir


def write_lesson(
    module_dir: Path,
    *,
    filename: str = "01-first-steps.md",
    slug: str = "first-steps",
    position: int = 1,
    title: str = "First steps",
    body: str = "Some explanation.",
    worked_example_code: str | None = 'print("Hello")',
) -> None:
    front: dict[str, Any] = {"slug": slug, "position": position, "title": title}
    if worked_example_code is not None:
        front["worked_example_code"] = worked_example_code
    document = "---\n" + yaml.safe_dump(front) + "---\n\n" + textwrap.dedent(body).strip() + "\n"
    (module_dir / "lessons" / filename).write_text(document, encoding="utf-8")


def write_exercise(
    module_dir: Path,
    *,
    filename: str = "01-say-hello.yaml",
    slug: str = "say-hello",
    lesson: str = "first-steps",
    position: int = 1,
    title: str = "Say hello",
    scaffold_level: str = "fill_in",
    bloom: str = "apply",
    prompt: str = "Print the word Hello.",
    starter_code: str = "print(...)",
    checks: list[dict[str, Any]] | None = None,
    solution_code: str = 'print("Hello")',
    hints: list[str] | None = None,
    stdin: list[str] | None = None,
) -> None:
    data: dict[str, Any] = {
        "slug": slug,
        "lesson": lesson,
        "position": position,
        "title": title,
        "scaffold_level": scaffold_level,
        "bloom": bloom,
        "prompt_markdown": prompt,
        "starter_code": starter_code,
        # `is None` rather than falsy, so a test can deliberately write an
        # exercise with an empty check list and see it rejected.
        "checks": (
            [{"kind": "stdout", "label": "Prints Hello", "expected": "Hello"}]
            if checks is None
            else checks
        ),
        "solution_code": solution_code,
    }
    if hints:
        data["hints"] = hints
    if stdin:
        data["stdin"] = stdin
    (module_dir / "exercises" / filename).write_text(yaml.safe_dump(data), encoding="utf-8")


def minimal_curriculum(root: Path) -> Path:
    """One track, one module, one lesson, one exercise."""
    write_tracks(root)
    module_dir = write_module(root)
    write_lesson(module_dir)
    write_exercise(module_dir)
    return root
