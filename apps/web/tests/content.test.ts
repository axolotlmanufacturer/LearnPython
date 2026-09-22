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
  /** As written: literal text, or a reference to a shared file under content/. */
  files?: Record<string, string | { from: string }>;
  checks: Check[];
  solution_code: string;
  hints?: string[];
  packages?: string[];
}

/**
 * Inline `{from: datasets/expression.csv}` references, as the Python loader does
 * (`_resolve_files` in app/content/loader.py). Duplicated rather than shared
 * because the two sides are different languages; the Python loader is the one
 * the product uses, and this only has to agree with it for these tests to be
 * running the same files a learner would get.
 */
function resolveFiles(files: Record<string, string | { from: string }>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([name, value]) => [
      name,
      typeof value === "string" ? value : readFileSync(path.join(CONTENT_DIR, value.from), "utf8"),
    ]),
  );
}

interface AuthoredExercise extends ExerciseFile {
  /** Resolved: every reference replaced by the file's contents. */
  files: Record<string, string>;
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
      found.push({
        ...data,
        files: resolveFiles(data.files ?? {}),
        where: path.relative(CONTENT_DIR, full),
      });
    }
  };

  walk(CONTENT_DIR);
  return found.sort((a, b) => a.where.localeCompare(b.where));
}

const exercises = collectExercises();

interface WorkedExampleFile {
  where: string;
  code: string;
  packages: string[];
  stdin: string[];
  /** Set when the example fails on purpose, in a lesson about reading errors. */
  raises: string | null;
}

/**
 * Every lesson's worked example.
 *
 * The first code a learner runs in a lesson, and for a long time the only code
 * in the curriculum that CI never executed. Track B's examples imported pandas
 * without declaring it, so every one would have stopped at `import pandas` in
 * a browser — and nothing noticed, because only exercises were run here.
 */
function collectWorkedExamples(): WorkedExampleFile[] {
  const found: WorkedExampleFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (path.basename(dir) !== "lessons" || !entry.endsWith(".md")) continue;
      const front = readFileSync(full, "utf8").split(/^---$/m)[1] ?? "";
      const meta = parse(front) as {
        worked_example_code?: string;
        worked_example_packages?: string[];
        worked_example_stdin?: string[];
        worked_example_raises?: string;
      };
      if (meta.worked_example_code) {
        found.push({
          where: path.relative(CONTENT_DIR, full),
          code: meta.worked_example_code,
          packages: meta.worked_example_packages ?? [],
          stdin: meta.worked_example_stdin ?? [],
          raises: meta.worked_example_raises ?? null,
        });
      }
    }
  };
  walk(CONTENT_DIR);
  return found.sort((a, b) => a.where.localeCompare(b.where));
}

const workedExamples = collectWorkedExamples();

/**
 * Exercises this runner can actually execute.
 *
 * An exercise that declares packages needs compiled wasm wheels, which the
 * Pyodide npm package does not ship — they are fetched from the distribution
 * CDN at runtime. Downloading tens of megabytes of scipy inside a unit-test run
 * would be slow, flaky, and dependent on a third party being up, which is the
 * same reason the end-to-end suite self-hosts the interpreter.
 *
 * Those exercises are verified instead against CPython with the real libraries
 * installed, in apps/api/tests/test_authored_content_packages.py — the same
 * harness.py, a third place it runs. See docs/spike-scientific-stack.md §4 for
 * what that does and does not prove.
 */
const runnable = exercises.filter((exercise) => (exercise.packages?.length ?? 0) === 0);

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

  describe.each(runnable.map((e) => [e.where, e] as const))("%s", (_where, exercise) => {
    it("has a reference solution that passes its own checks", async () => {
      const result = await runner.run({
        code: exercise.solution_code,
        stdin: exercise.stdin,
        files: exercise.files,
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
        files: exercise.files,
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

describe("worked examples", () => {
  it("has worked examples to check", () => {
    expect(workedExamples.length).toBeGreaterThan(0);
  });

  // Those that need packages are run under CPython instead, alongside the
  // exercises that need them: apps/api/tests/test_authored_content_packages.py.
  const plain = workedExamples.filter((example) => example.packages.length === 0);

  it.each(plain.map((e) => [e.where, e] as const))(
    "%s runs as intended",
    async (_where, example) => {
      const result = await runner.run({ code: example.code, stdin: example.stdin });

      if (example.raises) {
        // A lesson about reading errors shows one on purpose. Assert it is the
        // intended error, so a deliberate crash cannot quietly become a
        // different, accidental one.
        expect(result.error?.type, `${example.where} should raise ${example.raises}`).toBe(
          example.raises,
        );
        return;
      }

      expect(
        result.status,
        `The worked example in ${example.where} stops with ` +
          `${result.error?.type}: ${result.error?.message}`,
      ).toBe("ok");
    },
  );

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

  it("only declares packages the shipped interpreter can actually supply", () => {
    // The Python schema's ALLOW_LIST catches typos and makes adding a package a
    // deliberate act, but it cannot know what the interpreter has. This can:
    // pyodide-lock.json is the registry `loadPackage` resolves against, read
    // from the exact npm package the build pins to.
    //
    // What this guards against is a Pyodide upgrade quietly renaming or
    // dropping a package. The failure would otherwise appear at a learner's
    // keystroke, in the one part of the product with no server-side fallback.
    const lock = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../../../node_modules/pyodide/pyodide-lock.json"),
        "utf8",
      ),
    ) as { packages: Record<string, { depends: string[] }> };

    for (const exercise of exercises) {
      for (const name of exercise.packages ?? []) {
        expect(
          lock.packages[name],
          `${exercise.where} declares "${name}", which is not in the Pyodide ` +
            `distribution this build ships.`,
        ).toBeDefined();
      }
    }
  });
});
