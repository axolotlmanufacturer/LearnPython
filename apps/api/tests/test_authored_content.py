"""The real curriculum under content/ must load and be structurally sound.

The loader tests use fixtures; this one points at the actual authored content,
so a curriculum change that breaks a pedagogical invariant fails here rather than
at a learner's keystroke. Whether each exercise is *solvable* is checked
separately, in apps/web/tests/content.test.ts, which runs every reference
solution through the real interpreter.
"""

from __future__ import annotations

from app.config import get_settings
from app.content.loader import load_curriculum
from app.content.schema import Bloom, ScaffoldLevel

CURRICULUM = load_curriculum(get_settings().content_dir)


def test_the_authored_curriculum_loads():
    assert [t.slug for t in CURRICULUM.tracks] == ["track-a", "track-b"]
    assert [m.slug for m in CURRICULUM.modules] == ["orientation", "values", "strings"]


def test_track_b_declares_its_prerequisite():
    # Section 5A: Track B builds on Track A rather than standing alone.
    track_b = next(t for t in CURRICULUM.tracks if t.slug == "track-b")
    assert track_b.prerequisite_slug == "track-a"


def test_every_module_states_bloom_tagged_objectives():
    for module in CURRICULUM.modules:
        assert module.objectives, f"{module.slug} has no objectives"
        for objective in module.objectives:
            assert isinstance(objective.bloom, Bloom)


def test_every_lesson_has_a_worked_example_before_its_exercises():
    # Section 2.1, the worked-example effect: a beginner should see a solved
    # instance before being asked to produce one.
    for module in CURRICULUM.modules:
        for lesson in module.lessons:
            if lesson.exercises:
                assert lesson.worked_example_code, (
                    f"{module.slug}/{lesson.slug} sets exercises without a worked example"
                )


def test_every_lesson_has_at_least_one_exercise():
    for module in CURRICULUM.modules:
        for lesson in module.lessons:
            assert lesson.exercises, f"{module.slug}/{lesson.slug} has no exercises"


def test_each_module_offers_between_three_and_six_exercises():
    # Section 5: "3-6 scaffolded exercises of increasing independence" per module.
    for module in CURRICULUM.modules:
        count = sum(len(lesson.exercises) for lesson in module.lessons)
        assert 3 <= count <= 8, f"{module.slug} has {count} exercises"


def test_each_module_ends_more_independently_than_it_starts():
    # Section 2.2: scaffolding is withdrawn across a module, not held constant.
    for module in CURRICULUM.modules:
        levels = [
            exercise.scaffold_level.rank
            for lesson in module.lessons
            for exercise in lesson.exercises
        ]
        assert levels[-1] > levels[0], (
            f"{module.slug} does not reduce support between its first and last exercise"
        )


def test_module_zero_asks_nothing_above_analyze():
    # Module 0 exists to reduce cognitive load before real content starts
    # (Section 5); it is not the place for open-ended creation.
    orientation = next(m for m in CURRICULUM.modules if m.slug == "orientation")
    for lesson in orientation.lessons:
        for exercise in lesson.exercises:
            assert exercise.scaffold_level is not ScaffoldLevel.OPEN_ENDED
            assert exercise.bloom is not Bloom.CREATE


def test_each_module_after_the_first_revisits_earlier_material():
    # Section 2.4: retrieval practice resurfaces earlier modules rather than only
    # testing what was just taught.
    for module in CURRICULUM.modules:
        if module.position == 0:
            continue
        revisits = {
            item.reviews_module_slug for item in module.quiz if item.reviews_module_slug
        } - {module.slug}
        assert revisits, f"{module.slug}'s quiz revisits nothing earlier"


def test_every_debug_exercise_gives_the_learner_broken_code_to_read():
    for module in CURRICULUM.modules:
        for lesson in module.lessons:
            for exercise in lesson.exercises:
                if exercise.scaffold_level is ScaffoldLevel.DEBUG:
                    assert exercise.starter_code.strip(), f"{exercise.slug} has nothing to debug"


def test_exercises_that_read_input_supply_the_answers():
    # An exercise that calls input() without supplying stdin would stop with an
    # EOFError the moment a learner ran it.
    for module in CURRICULUM.modules:
        for lesson in module.lessons:
            for exercise in lesson.exercises:
                if "input(" in exercise.solution_code:
                    assert exercise.stdin, f"{exercise.slug} calls input() but supplies no stdin"
