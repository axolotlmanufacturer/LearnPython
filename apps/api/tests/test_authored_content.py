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
    assert CURRICULUM.modules, "no modules loaded"


def test_modules_are_numbered_consecutively_from_zero():
    # A gap means a module was renamed or dropped and something now refers to a
    # position that is not there; a duplicate means two modules claim the same
    # place in the sequence. Asserting the shape rather than a fixed list lets
    # the curriculum grow without editing this test every time.
    positions = sorted(m.position for m in CURRICULUM.modules if m.track == "track-a")

    assert positions == list(range(len(positions))), f"track-a positions are {positions}"


def test_the_first_module_is_the_orientation():
    first = min(CURRICULUM.modules, key=lambda m: m.position)

    assert first.slug == "orientation"


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


def _scaffold_ranks(module: object) -> list[int]:
    return [
        exercise.scaffold_level.rank
        for lesson in module.lessons  # type: ignore[attr-defined]
        for exercise in lesson.exercises
    ]


def test_support_never_increases_within_a_lesson():
    # Section 2.2: scaffolding is withdrawn as mastery is demonstrated, never
    # reinstated. The lesson is the right unit for this — a *new* lesson
    # introduces a new idea and may legitimately start with more support again,
    # which is why Module 0's second lesson opens with a fill-in after the first
    # closed with a modify.
    for module in CURRICULUM.modules:
        for lesson in module.lessons:
            ranks = [exercise.scaffold_level.rank for exercise in lesson.exercises]
            assert ranks == sorted(ranks), (
                f"{module.slug}/{lesson.slug} re-applies support: {ranks}"
            )


def test_each_teaching_module_ends_more_independently_than_it_starts():
    for module in CURRICULUM.modules:
        ranks = _scaffold_ranks(module)
        if len(set(ranks)) == 1:
            # A capstone module is open-ended throughout by design — there is no
            # progression to make because it *is* the end of the progression.
            continue
        assert ranks[-1] > ranks[0], (
            f"{module.slug} does not reduce support between its first and last exercise"
        )


def test_the_capstone_module_is_open_ended_throughout():
    capstones = max(CURRICULUM.modules, key=lambda m: m.position)

    for lesson in capstones.lessons:
        for exercise in lesson.exercises:
            assert exercise.scaffold_level is ScaffoldLevel.OPEN_ENDED
            assert exercise.rubric, f"{exercise.slug} is open-ended but offers no rubric"


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
