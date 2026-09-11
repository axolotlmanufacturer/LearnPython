"use client";

/**
 * One exercise: prompt, editor, run, feedback, hints.
 *
 * Design notes worth keeping:
 *
 *  - Hints are revealed one at a time (Section 6, feature 8). A learner who
 *    takes hint 1 and solves it has learned more than one handed the answer, so
 *    the button says how many remain rather than offering them all at once.
 *  - The runtime starts loading when the card first appears on screen, not when
 *    Run is pressed, so the ~2 s cold start overlaps with reading the prompt.
 *  - A learner's code is kept in this component's state only. Persisting drafts
 *    is a real want, but it needs a considered answer about where — deferred
 *    rather than half-done.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { CodeEditor } from "@/components/CodeEditor";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { OutputPane } from "@/components/OutputPane";
import { usePythonRunner } from "@/components/PythonRunnerProvider";
import { Markdown } from "@/components/Markdown";
import { SCAFFOLD_LABELS, type ApiExercise } from "@/lib/api";
import type { ExecutionResult } from "@/lib/python/types";

export function ExerciseCard({
  exercise,
  index,
  total,
  onSolved,
  onAttempt,
}: {
  exercise: ApiExercise;
  index: number;
  total: number;
  onSolved?: (slug: string) => void;
  onAttempt?: (slug: string, code: string, passed: boolean) => void;
}) {
  const { state, prepare, run } = usePythonRunner();
  const [code, setCode] = useState(exercise.starter_code);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [solved, setSolved] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  // Warm the interpreter up as the card comes into view, so the cold start
  // overlaps with reading rather than delaying the first Run.
  useEffect(() => {
    const element = cardRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      prepare();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          prepare();
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [prepare]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const outcome = await run({
        code,
        stdin: exercise.stdin,
        files: exercise.files,
        checks: exercise.checks,
      });
      setResult(outcome);
      onAttempt?.(exercise.slug, code, outcome.passed);
      if (outcome.passed && !solved) {
        setSolved(true);
        onSolved?.(exercise.slug);
      }
    } finally {
      setRunning(false);
    }
  }, [
    code,
    exercise.checks,
    exercise.files,
    exercise.slug,
    exercise.stdin,
    onAttempt,
    onSolved,
    run,
    solved,
  ]);

  const handleReset = useCallback(() => {
    setCode(exercise.starter_code);
    setResult(null);
  }, [exercise.starter_code]);

  const busy = running || state === "loading" || state === "restarting";
  const hintsLeft = exercise.hints.length - hintsShown;

  return (
    <section
      ref={cardRef}
      id={`exercise-${exercise.slug}`}
      aria-labelledby={`exercise-${exercise.slug}-title`}
      className="rounded-lg border border-rule bg-paper p-5 sm:p-6"
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`exercise-${exercise.slug}-title`} className="text-lg font-semibold">
          <span className="text-ink-soft">
            Exercise {index + 1} of {total}:{" "}
          </span>
          {exercise.title}
        </h3>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-paper-sunk px-2.5 py-1 text-xs font-medium text-ink-soft">
            {SCAFFOLD_LABELS[exercise.scaffold_level] ?? exercise.scaffold_level}
          </span>
          {solved && (
            <span className="text-sm font-medium text-pass">
              <span aria-hidden="true">✓ </span>Done
            </span>
          )}
        </div>
      </header>

      <Markdown>{exercise.prompt_markdown}</Markdown>

      {exercise.stdin.length > 0 && (
        <p className="mt-4 rounded border border-rule bg-paper-sunk px-3 py-2 text-sm text-ink-soft">
          When this runs, the answers typed in will be:{" "}
          {exercise.stdin.map((line, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <code className="rounded bg-paper px-1">{line}</code>
            </span>
          ))}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Your code
          </h4>
          <CodeEditor
            value={code}
            onChange={setCode}
            label={`Python editor for the exercise "${exercise.title}"`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="rounded bg-brand px-5 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Running…" : "Run"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
            >
              Reset to the starting code
            </button>
          </div>
        </div>

        <OutputPane
          segments={result?.console ?? []}
          runnerState={state}
          hasRun={result !== null}
          truncated={result?.truncated ?? false}
        />
      </div>

      {result && <FeedbackPanel result={result} />}

      {exercise.hints.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <ol className="space-y-2">
            {exercise.hints.slice(0, hintsShown).map((hint, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold text-ink-soft">Hint {i + 1}: </span>
                <Markdown className="lp-prose-inline inline">{hint}</Markdown>
              </li>
            ))}
          </ol>
          {hintsLeft > 0 && (
            <button
              type="button"
              onClick={() => setHintsShown((n) => n + 1)}
              className={`text-sm font-medium text-brand underline underline-offset-2 hover:text-brand-dark ${
                hintsShown > 0 ? "mt-3" : ""
              }`}
            >
              {hintsShown === 0
                ? `Stuck? Show a hint (${hintsLeft} available)`
                : `Show another hint (${hintsLeft} left)`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
