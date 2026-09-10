"use client";

/**
 * A runnable worked example.
 *
 * Section 2.1: a beginner should see a solved instance before being asked to
 * produce one. Making it runnable, and editable, is the difference between an
 * example that is read and one that is understood — the most useful thing a
 * learner can do here is change a value and find out what happens, with no
 * exercise riding on the result.
 */

import { useState } from "react";

import { CodeEditor } from "@/components/CodeEditor";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { OutputPane } from "@/components/OutputPane";
import { usePythonRunner } from "@/components/PythonRunnerProvider";
import type { ExecutionResult } from "@/lib/python/types";

export function WorkedExample({ code, note }: { code: string; note: string | null }) {
  const { state, run } = usePythonRunner();
  const [source, setSource] = useState(code);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [running, setRunning] = useState(false);

  const busy = running || state === "loading" || state === "restarting";

  async function handleRun() {
    setRunning(true);
    try {
      setResult(await run({ code: source }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section
      aria-labelledby="worked-example-heading"
      className="mt-10 rounded-lg border border-rule bg-paper-sunk p-5 sm:p-6"
    >
      <h2 id="worked-example-heading" className="text-lg font-semibold">
        Worked example
      </h2>

      {note && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{note}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <CodeEditor
            value={source}
            onChange={setSource}
            label="Worked example — you can change this and run it"
            minHeight="8rem"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRun}
              disabled={busy}
              className="rounded bg-brand px-5 py-2 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Running…" : "Run this example"}
            </button>
            {source !== code && (
              <button
                type="button"
                onClick={() => {
                  setSource(code);
                  setResult(null);
                }}
                className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
              >
                Put it back as it was
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            Nothing here is marked. Change it, break it, see what happens.
          </p>
        </div>

        <OutputPane
          segments={result?.console ?? []}
          runnerState={state}
          hasRun={result !== null}
          truncated={result?.truncated ?? false}
        />
      </div>

      {/* Anything other than a clean run gets an explanation. A worked example
          has no checks to report, but a learner who has just edited it into an
          error — which is exactly what they are invited to do — must be told
          what happened, and so must one whose runtime failed to start. */}
      {result && result.status !== "ok" && <FeedbackPanel result={result} />}
    </section>
  );
}
