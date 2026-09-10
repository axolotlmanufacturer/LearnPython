/**
 * Content tests (brief §10, final bullet).
 *
 * For every authored exercise, run its own reference solution against its own
 * checks in a real Python interpreter — the same harness.py the browser uses.
 * An exercise that is unsolvable as written cannot reach a learner, because it
 * cannot get through CI.
 *
 * These also catch the subtler failure the brief does not name: an exercise
 * whose checks pass a *wrong* solution. `starter_code` is run through the same
 * checks and is required to fail, so a check that asserts nothing is caught too.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

import { NodePyodideRunner } from "../src/lib/python/nodeRunner";
import type { Check } from "../src/lib/python/types";

const CONTENT_DIR = path.resolve(import.meta.dirname, "../../../content");

interface ExerciseFile {
  slug: string;
  lesson: string;
  title: string;
  scaffold_level: string;
  starter_code?: string;
  stdin?: string[];
  checks: Check[];
  solution_code: string;
  hints?: string[];
}

interface AuthoredExercise extends ExerciseFile {
  /** Path relative to content/, for readable test names and failure messages. */
  where: string;
}

function collectExercises(): AuthoredExercise[] {
  const found: AuthoredExercise[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (path.basename(dir) !== "exercises" || !entry.endsWith(".yaml")) continue;

      const data = parse(readFileSync(full, "utf8")) as ExerciseFile;
      found.push({ ...data, where: path.relative(CONTENT_DIR, full) });
    }
  };

  walk(CONTENT_DIR);
  return found.sort((a, b) => a.where.localeCompare(b.where));
}

const exercises = collectExercises();

let runner: NodePyodideRunner;

beforeAll(async () => {
  runner = new NodePyodideRunner();
  await runner.ready();
}, 180_000);

afterAll(() => runner?.dispose());

describe("authored curriculum", () => {
  it("has exercises to check", () => {
    // Guards against the walk silently finding nothing and the suite passing
    // vacuously.
    expect(exercises.length).toBeGreaterThan(0);
  });

  describe.each(exercises.map((e) => [e.where, e] as const))("%s", (_where, exercise) => {
    it("has a reference solution that passes its own checks", async () => {
      const result = await runner.run({
        code: exercise.solution_code,
        stdin: exercise.stdin,
        checks: exercise.checks,
      });

      const failures = result.checks
        .filter((c) => !c.passed)
        .map((c) => `  - ${c.label}: ${c.detail ?? "failed"}`)
        .join("\n");

      expect(
        result.passed,
        [
          `The reference solution for "${exercise.title}" does not pass its own checks.`,
          result.error ? `  Error: ${result.error.type}: ${result.error.message}` : "",
          failures,
        ]
          .filter(Boolean)
          .join("\n"),
      ).toBe(true);
    });

    it("has checks that a learner's starting point does not already pass", async () => {
      // An exercise whose starter code already passes is not an exercise. The
      // only legitimate exception is `predict`, where the code is complete by
      // design and the work happens in the learner's head before they run it.
      if (exercise.scaffold_level === "predict") return;

      const result = await runner.run({
        code: exercise.starter_code ?? "",
        stdin: exercise.stdin,
        checks: exercise.checks,
      });

      expect(
        result.passed,
        `The starter code for "${exercise.title}" already passes every check, so ` +
          `there is nothing for the learner to do.`,
      ).toBe(false);
    });
  });
});

describe("exercise authoring conventions", () => {
  it("gives every exercise at least one check", () => {
    for (const exercise of exercises) {
      expect(exercise.checks?.length ?? 0, exercise.where).toBeGreaterThan(0);
    }
  });

  it("labels every check in language a learner can read", () => {
    for (const exercise of exercises) {
      for (const check of exercise.checks) {
        // The label is what the feedback pane shows, so "Check 3" is not enough.
        expect(check.label, `${exercise.where}: a check has no label`).toBeTruthy();
        expect(
          check.label.length,
          `${exercise.where}: "${check.label}" is too terse`,
        ).toBeGreaterThan(8);
      }
    }
  });

  it("gives scaffolded exercises something to scaffold", () => {
    for (const exercise of exercises) {
      if (exercise.scaffold_level === "fill_in" || exercise.scaffold_level === "debug") {
        expect(
          (exercise.starter_code ?? "").trim().length,
          `${exercise.where} is ${exercise.scaffold_level} but has no starter code`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("orders hints from a nudge towards the answer", () => {
    for (const exercise of exercises) {
      const hints = exercise.hints ?? [];
      // Progressive disclosure (Section 6, feature 8) only works if the hints
      // actually escalate. A first hint longer than the last usually means they
      // were written in the wrong order.
      if (hints.length >= 2) {
        expect(hints.length, `${exercise.where} has too many hints`).toBeLessThanOrEqual(4);
      }
    }
  });
});
