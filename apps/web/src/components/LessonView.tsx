"use client";

/**
 * A lesson: prose, a worked example that can be run, then the exercises.
 *
 * The order on the page is the pedagogy (Section 2.1, the worked-example
 * effect): a learner sees a solved instance, and can run it, before being asked
 * to produce one.
 *
 * Progress is recorded as a side effect of doing the work, not by asking the
 * learner to declare it. Opening the lesson marks it in progress; solving every
 * exercise marks it complete. A lesson with no exercises completes on the way
 * out, via the "next" link.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ExerciseCard } from "@/components/ExerciseCard";
import { Markdown } from "@/components/Markdown";
import { PythonRunnerProvider } from "@/components/PythonRunnerProvider";
import { WorkedExample } from "@/components/WorkedExample";
import { api, type ApiLesson, type ApiLessonSummary } from "@/lib/api";

export function LessonView({
  lesson,
  moduleSlug,
  moduleTitle,
  siblings,
  signedIn,
}: {
  lesson: ApiLesson;
  moduleSlug: string;
  moduleTitle: string;
  siblings: ApiLessonSummary[];
  /** Resolved on the server, so the page renders correct on first paint. */
  signedIn: boolean;
}) {
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);

  const index = siblings.findIndex((s) => s.slug === lesson.slug);
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const previous = index > 0 ? siblings[index - 1] : undefined;

  const total = lesson.exercises.length;
  const complete = total > 0 && solved.size === total;

  // Opening a lesson is what starts it. Nothing to click.
  useEffect(() => {
    if (!signedIn) return;
    void api.setLessonProgress(moduleSlug, lesson.slug, "in_progress").catch(() => undefined);
  }, [signedIn, moduleSlug, lesson.slug]);

  useEffect(() => {
    if (!signedIn || !complete) return;
    void api
      .setLessonProgress(moduleSlug, lesson.slug, "completed")
      .catch(() => setSaveFailed(true));
  }, [signedIn, complete, moduleSlug, lesson.slug]);

  const handleSolved = useCallback((slug: string) => {
    setSolved((previousSolved) => new Set(previousSolved).add(slug));
  }, []);

  const handleAttempt = useCallback(
    (slug: string, code: string, passed: boolean) => {
      if (!signedIn) return;
      // Best-effort: a learner mid-exercise should never be interrupted because
      // a bookkeeping request failed.
      void api.recordSubmission({ exercise_slug: slug, code, passed }).catch(() => undefined);
    },
    [signedIn],
  );

  return (
    <main id="main" className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm text-ink-soft">
        <Link href="/learn" className="hover:text-brand">
          Curriculum
        </Link>{" "}
        <span aria-hidden="true">/</span>{" "}
        <Link href={`/learn/${moduleSlug}`} className="hover:text-brand">
          {moduleTitle}
        </Link>
      </p>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{lesson.title}</h1>

      {total > 0 && <ProgressBar done={solved.size} total={total} signedIn={signedIn} />}

      <article className="mt-8">
        <Markdown>{lesson.content_markdown}</Markdown>
      </article>

      <PythonRunnerProvider>
        {lesson.worked_example_code && (
          <WorkedExample
            code={lesson.worked_example_code}
            note={lesson.worked_example_note}
            packages={lesson.worked_example_packages}
            stdin={lesson.worked_example_stdin}
          />
        )}

        {total > 0 && (
          <section aria-labelledby="exercises-heading" className="mt-12">
            <h2 id="exercises-heading" className="text-xl font-semibold">
              Your turn
            </h2>
            <div className="mt-5 space-y-8">
              {lesson.exercises.map((exercise, exerciseIndex) => (
                <ExerciseCard
                  key={exercise.slug}
                  exercise={exercise}
                  index={exerciseIndex}
                  total={total}
                  onSolved={handleSolved}
                  onAttempt={handleAttempt}
                />
              ))}
            </div>
          </section>
        )}
      </PythonRunnerProvider>

      {complete && (
        <p
          role="status"
          className="mt-10 rounded border border-pass/40 bg-pass-wash px-4 py-3 font-medium"
          data-testid="lesson-complete"
        >
          <span aria-hidden="true">✓ </span>
          Lesson complete.
          {signedIn
            ? " Your progress is saved."
            : " Sign in if you would like your progress kept for next time."}
        </p>
      )}

      {saveFailed && (
        <p role="alert" className="mt-4 text-sm text-warn">
          Your progress could not be saved just now. The work you have done in this lesson is still
          on screen.
        </p>
      )}

      <nav
        aria-label="Lesson"
        className="mt-12 flex items-center justify-between gap-4 border-t border-rule pt-6"
      >
        {previous ? (
          <Link href={`/learn/${moduleSlug}/${previous.slug}`} className="text-sm hover:text-brand">
            <span aria-hidden="true">← </span>
            {previous.title}
          </Link>
        ) : (
          <span />
        )}

        {next ? (
          <Link
            href={`/learn/${moduleSlug}/${next.slug}`}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            {next.title}
            <span aria-hidden="true"> →</span>
          </Link>
        ) : (
          <Link
            href={`/learn/${moduleSlug}`}
            className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Back to {moduleTitle}
          </Link>
        )}
      </nav>
    </main>
  );
}

function ProgressBar({
  done,
  total,
  signedIn,
}: {
  done: number;
  total: number;
  signedIn: boolean;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-soft" data-testid="lesson-progress">
          {done} of {total} exercises done
        </span>
        {!signedIn && (
          <Link href="/sign-in" className="text-brand underline underline-offset-2">
            Sign in to save your progress
          </Link>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Exercises completed in this lesson"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-sunk"
      >
        <div
          className="h-full rounded-full bg-pass transition-[width] duration-300"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
