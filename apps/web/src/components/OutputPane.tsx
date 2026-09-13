"use client";

/**
 * Shows what a program printed.
 *
 * Output is rendered as text nodes, never as HTML — a program that prints
 * `<img onerror=...>` must display those characters, not run them (Section 8).
 * React escapes by default; this comment exists so nobody "improves" it with
 * dangerouslySetInnerHTML later.
 *
 * The three streams are distinguished by shape as well as colour, because
 * colour alone does not satisfy WCAG 2.1 AA: error output is prefixed and
 * italicised, and echoed input is marked with a chevron.
 */

import type { ConsoleSegment, RunnerState } from "@/lib/python/types";

export function OutputPane({
  segments,
  runnerState,
  hasRun,
  truncated,
}: {
  segments: ConsoleSegment[];
  runnerState: RunnerState;
  hasRun: boolean;
  truncated: boolean;
}) {
  const loading = runnerState === "loading" || runnerState === "restarting";
  // A separate message from the interpreter's own cold start: this one is
  // several times larger and happens later, so a learner who has already sat
  // through "starting Python" would otherwise think it had gone wrong.
  const loadingPackages = runnerState === "loading-packages";

  return (
    <section aria-labelledby="output-heading" className="flex h-full flex-col">
      <h3
        id="output-heading"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft"
      >
        Output
      </h3>
      <div
        // Announced politely so a screen-reader user hears the result of a run
        // without having to go looking for it.
        role="status"
        aria-live="polite"
        // Lesson prose often contains the same words a program prints, so tests
        // need a way to assert on the output specifically.
        data-testid="output"
        aria-atomic="false"
        className="min-h-32 flex-1 overflow-auto rounded border border-rule bg-paper-sunk p-3 font-mono text-sm leading-relaxed"
      >
        {loading && (
          <p className="text-ink-soft">
            Starting Python in your browser… this happens once and takes a few seconds.
          </p>
        )}

        {loadingPackages && (
          <p className="text-ink-soft">
            Fetching the data-analysis libraries… this is a large download the first time, and it is
            then reused for the rest of the track.
          </p>
        )}

        {!loading && !loadingPackages && !hasRun && (
          <p className="font-sans text-ink-soft">Press Run to see what your program does.</p>
        )}

        {!loading && !loadingPackages && hasRun && segments.length === 0 && (
          <p className="font-sans text-ink-soft">
            The program ran without printing anything. Add a <code>print(...)</code> to see a value.
          </p>
        )}

        {segments.map((segment, index) => (
          <Segment key={index} segment={segment} />
        ))}

        {truncated && (
          <p className="mt-2 font-sans text-warn">
            Output was cut short because the program printed far more than expected.
          </p>
        )}
      </div>
    </section>
  );
}

function Segment({ segment }: { segment: ConsoleSegment }) {
  if (segment.stream === "err") {
    return (
      <span className="whitespace-pre-wrap italic text-fail">
        {segment.text}
        <span className="sr-only"> (error output)</span>
      </span>
    );
  }

  if (segment.stream === "in") {
    // What a learner would have typed at the prompt. Marked so it is not
    // mistaken for something the program printed.
    return (
      <span className="whitespace-pre-wrap text-brand">
        <span aria-hidden="true">❯ </span>
        <span className="sr-only">typed: </span>
        {segment.text}
      </span>
    );
  }

  return <span className="whitespace-pre-wrap">{segment.text}</span>;
}
