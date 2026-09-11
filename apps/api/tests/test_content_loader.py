"""Tests for curriculum loading and validation.

The point of these is that a bad content file fails loudly, in CI, rather than
reaching a learner. Several of the invariants asserted here are pedagogical
rather than technical — scaffolding order, spaced-repetition coverage — and are
enforced in code precisely so they do not depend on a reviewer noticing.
"""

from __future__ import annotations

import pytest

from app.content.loader import ContentError, harness_payload, load_curriculum
from app.content.schema import (
    CallCheck,
    Curriculum,
    ExerciseFile,
    LessonFile,
    ModuleFile,
    QuizItemFile,
    ScaffoldLevel,
    TrackFile,
    validate_curriculum,
)
from tests.factories import (
    minimal_curriculum,
    write_exercise,
    write_lesson,
    write_module,
    write_tracks,
)


def test_loads_a_minimal_curriculum(tmp_path):
    curriculum = load_curriculum(minimal_curriculum(tmp_path))

    assert [t.slug for t in curriculum.tracks] == ["track-a"]
    assert [m.slug for m in curriculum.modules] == ["orientation"]

    lesson = curriculum.modules[0].lessons[0]
    assert lesson.title == "First steps"
    assert lesson.content_markdown.strip() == "Some explanation."
    assert [e.slug for e in lesson.exercises] == ["say-hello"]


def test_exercises_are_attached_to_their_lesson_in_position_order(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_exercise(
        module_dir,
        filename="02-second.yaml",
        slug="second",
        position=2,
        scaffold_level="write_from_spec",
        starter_code="",
    )
    write_exercise(module_dir, filename="01-first.yaml", slug="first", position=1)

    curriculum = load_curriculum(tmp_path)

    assert [e.slug for e in curriculum.modules[0].lessons[0].exercises] == ["first", "second"]


def test_a_missing_tracks_file_is_an_error(tmp_path):
    with pytest.raises(ContentError, match=r"tracks\.yaml"):
        load_curriculum(tmp_path)


def test_an_unknown_field_is_rejected_rather_than_silently_ignored(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    path = module_dir / "exercises" / "01-typo.yaml"
    write_exercise(module_dir, filename="01-typo.yaml", slug="typo")
    path.write_text(path.read_text(encoding="utf-8") + "starter_cod: oops\n", encoding="utf-8")

    with pytest.raises(ContentError, match="starter_cod"):
        load_curriculum(tmp_path)


def test_an_exercise_naming_a_nonexistent_lesson_is_an_error(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_exercise(
        module_dir, filename="02-orphan.yaml", slug="orphan", lesson="no-such-lesson", position=2
    )

    with pytest.raises(ContentError, match="no-such-lesson"):
        load_curriculum(tmp_path)


def test_an_exercise_with_no_checks_is_an_error(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_exercise(module_dir, checks=[])

    with pytest.raises(ContentError, match="checks"):
        load_curriculum(tmp_path)


def test_a_module_with_no_lessons_is_an_error(tmp_path):
    write_tracks(tmp_path)
    write_module(tmp_path)

    with pytest.raises(ContentError, match="no lessons"):
        load_curriculum(tmp_path)


def test_a_quiz_answer_must_be_one_of_its_options(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(
        tmp_path,
        quiz=[
            {
                "slug": "q1",
                "prompt_markdown": "What does print do?",
                "options": ["Shows a value", "Deletes a value"],
                "answer": "Something else entirely",
            }
        ],
    )
    write_lesson(module_dir)
    write_exercise(module_dir)

    with pytest.raises(ContentError, match="not one of the options"):
        load_curriculum(tmp_path)


# ------------------------------------------------ pedagogical invariants


def _curriculum_with(exercises: list[ExerciseFile], position: int = 1) -> Curriculum:
    lesson = LessonFile(
        slug="lesson", position=1, title="Lesson", content_markdown="x", exercises=exercises
    )
    module = ModuleFile(
        slug="module",
        track="track-a",
        position=position,
        title="Module",
        objectives=[{"text": "Do a thing", "bloom": "apply"}],
        lessons=[lesson],
    )
    return Curriculum(
        tracks=[TrackFile(slug="track-a", position=1, title="Track A")], modules=[module]
    )


def _exercise(slug: str, position: int, scaffold: ScaffoldLevel) -> ExerciseFile:
    return ExerciseFile(
        slug=slug,
        lesson="lesson",
        position=position,
        title=slug,
        scaffold_level=scaffold,
        prompt_markdown="Do it.",
        starter_code="# here",
        checks=[{"kind": "stdout", "label": "prints", "expected": "x"}],
        solution_code='print("x")',
    )


def test_scaffolding_may_be_withdrawn_across_a_lesson(tmp_path):
    curriculum = _curriculum_with(
        [
            _exercise("a", 1, ScaffoldLevel.FILL_IN),
            _exercise("b", 2, ScaffoldLevel.MODIFY),
            _exercise("c", 3, ScaffoldLevel.WRITE_FROM_SPEC),
        ]
    )

    assert validate_curriculum(curriculum) == []


def test_scaffolding_may_not_be_re_applied_mid_lesson(tmp_path):
    # Section 2.2: support is withdrawn as mastery is demonstrated, not
    # reinstated after an independent exercise.
    curriculum = _curriculum_with(
        [
            _exercise("a", 1, ScaffoldLevel.WRITE_FROM_SPEC),
            _exercise("b", 2, ScaffoldLevel.FILL_IN),
        ]
    )

    problems = validate_curriculum(curriculum)

    assert any("re-applies scaffolding" in problem for problem in problems)


def test_a_fill_in_exercise_must_actually_provide_something_to_fill_in():
    exercise = _exercise("a", 1, ScaffoldLevel.FILL_IN)
    exercise.starter_code = "   "

    problems = validate_curriculum(_curriculum_with([exercise]))

    assert any("fill_in but has no starter code" in problem for problem in problems)


def test_exercise_slugs_must_be_unique_across_the_whole_curriculum(tmp_path):
    # Submission lookups find an exercise by slug alone, with nothing to
    # disambiguate which lesson it belongs to. Two lessons reusing a slug would
    # make a learner's submission silently attach to the wrong exercise, so this
    # is stricter than the per-lesson uniqueness the schema itself requires.
    write_tracks(tmp_path)

    first = write_module(tmp_path)
    write_lesson(first)
    write_exercise(first, slug="say-hello")

    second = write_module(tmp_path, directory="01-values", slug="values", position=1)
    write_lesson(second, slug="numbers", title="Numbers", filename="01-numbers.md")
    write_exercise(
        second,
        filename="01-say-hello.yaml",
        slug="say-hello",
        lesson="numbers",
        scaffold_level="write_from_spec",
        starter_code="",
    )

    with pytest.raises(ContentError, match="reuses a slug already used"):
        load_curriculum(tmp_path)


def test_a_module_quiz_must_revisit_earlier_material(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(
        tmp_path,
        directory="01-values",
        slug="values",
        position=1,
        quiz=[
            {
                "slug": "q1",
                "prompt_markdown": "What is 2 + 2?",
                "options": ["4", "5"],
                "answer": "4",
            }
        ],
    )
    write_lesson(module_dir)
    write_exercise(module_dir)

    # Section 2.4: concept checks should resurface earlier material, not only
    # test what was just taught.
    with pytest.raises(ContentError, match="does not revisit any earlier module"):
        load_curriculum(tmp_path)


def test_module_zero_is_exempt_from_the_spaced_repetition_rule(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(
        tmp_path,
        quiz=[
            {
                "slug": "q1",
                "prompt_markdown": "What is code?",
                "options": ["Instructions", "A drink"],
                "answer": "Instructions",
            }
        ],
    )
    write_lesson(module_dir)
    write_exercise(module_dir)

    curriculum = load_curriculum(tmp_path)

    assert len(curriculum.modules[0].quiz) == 1


def test_a_quiz_item_may_not_reference_an_unknown_module():
    curriculum = _curriculum_with([_exercise("a", 1, ScaffoldLevel.FILL_IN)])
    curriculum.modules[0].quiz = [
        QuizItemFile(
            slug="q1",
            prompt_markdown="?",
            options=["a", "b"],
            answer="a",
            reviews_module_slug="nope",
        )
    ]

    problems = validate_curriculum(curriculum)

    assert any("reviews unknown module" in problem for problem in problems)


# ------------------------------------------------------- harness payload


def test_an_omitted_expected_becomes_a_truthiness_check():
    check = CallCheck(kind="call", label="works", function="f")
    exercise = _exercise("a", 1, ScaffoldLevel.FILL_IN)
    exercise.checks = [check]

    payload = harness_payload(exercise)

    # The harness reads a missing "expected" as "assert the result is truthy".
    assert "expected" not in payload[0]


def test_an_explicit_null_expected_is_preserved():
    check = CallCheck.model_validate(
        {"kind": "call", "label": "returns nothing", "function": "f", "expected": None}
    )
    exercise = _exercise("a", 1, ScaffoldLevel.FILL_IN)
    exercise.checks = [check]

    payload = harness_payload(exercise)

    # Written explicitly, `expected: null` means "assert the result is None" —
    # a different assertion from omitting the key entirely.
    assert "expected" in payload[0]
    assert payload[0]["expected"] is None


def test_an_unset_tolerance_is_dropped():
    exercise = _exercise("a", 1, ScaffoldLevel.FILL_IN)
    exercise.checks = [CallCheck(kind="call", label="w", function="f", expected=1)]

    assert "tolerance" not in harness_payload(exercise)[0]


# -------------------------------------------- YAML dialect (cross-parser)


def test_yaml_11_boolean_words_stay_strings(tmp_path):
    """`on`, `off`, `yes` and `no` are strings, not booleans.

    PyYAML implements YAML 1.1, where those four words are booleans; the
    JavaScript parser the content tests read the same files with implements YAML
    1.2, where they are strings. If the two disagree, the halves of the content
    pipeline see different data — and the symptom is bizarre: a word-count
    exercise containing the word "on" loses that key, grows a `True` one, passes
    the content test, and crashes the database load.
    """
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_exercise(
        module_dir,
        checks=[
            {
                "kind": "expr",
                "label": "The word counts are right",
                "expression": "counts",
                "expected": {"on": 1, "off": 2, "yes": 3, "no": 4, "the": 5},
            }
        ],
    )

    curriculum = load_curriculum(tmp_path)

    check = curriculum.modules[0].lessons[0].exercises[0].checks[0]
    assert check.expected == {"on": 1, "off": 2, "yes": 3, "no": 4, "the": 5}


def test_real_booleans_are_still_booleans(tmp_path):
    write_tracks(tmp_path)
    module_dir = write_module(tmp_path)
    write_lesson(module_dir)
    write_exercise(
        module_dir,
        checks=[
            {
                "kind": "expr",
                "label": "The flag is set",
                "expression": "flag",
                "expected": True,
            }
        ],
    )

    curriculum = load_curriculum(tmp_path)

    assert curriculum.modules[0].lessons[0].exercises[0].checks[0].expected is True
