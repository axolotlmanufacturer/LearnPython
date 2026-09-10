"use client";

/**
 * What a learner sees after pressing Run.
 *
 * This component is where Section 2's third principle actually lands: feedback
 * has to explain *why*, not just *that*. So the order on screen is deliberate:
 *
 *   1. A plain-language explanation of what happened.
 *   2. What to try next.
 *   3. The real traceback, underneath and collapsed by default — present so
 *      learners grow into reading it, not hidden so they never do.
 *
 * Nothing here is conveyed by colour alone (Section 8, WCAG 2.1 AA): every
 * pass/fail state also carries a text label and a symbol.
 */

import { useState } from "react";

import { explainError } from "@/lib/python/errorMapping";
import type { CheckResult, ExecutionResult } from "@/lib/python/types";

export function FeedbackPanel({ result }: { result: ExecutionResult }) {
  if (result.status === "crashed") {
    return (
      <Callout tone="warn" symbol="!" heading="Something went wrong on our side">
        <p>
          {result.error?.message ??
            "The Python runtime stopped unexpectedly. This is not a problem with your code."}
        </p>
        <p className="mt-2">Reloading the page usually clears it.</p>
      </Callout>
    );
  }

  if (result.status === "error" || result.status === "timeout") {
    return <ErrorFeedback result={result} />;
  }

  if (result.checks.length === 0) {
    return (
      <Callout tone="neutral" symbol="✓" heading="Your program ran">
        <p>No errors. Look at the output above to see what it did.</p>
      </Callout>
    );
  }

  return <CheckFeedback result={result} />;
}

function ErrorFeedback({ result }: { result: ExecutionResult }) {
  const [showTraceback, setShowTraceback] = useState(false);
  const error = result.error;
  if (!error) return null;

  const explanation = explainError(error);

  return (
    <Callout tone="fail" symbol="✕" heading={explanation.title}>
      <p>{explanation.explanation}</p>

      <p className="mt-3">
        <strong className="font-semibold">Try this: </strong>
        {explanation.nextStep}
      </p>

      {error.line !== null && (
        <p className="mt-3 text-sm">
          Python stopped at <strong className="font-semibold">line {error.line}</strong>
          {error.text ? (
            <>
              {": "}
              <code className="rounded bg-paper px-1 py-0.5">{error.text}</code>
            </>
          ) : (
            "."
          )}
        </p>
      )}

      {error.traceback && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowTraceback((open) => !open)}
            aria-expanded={showTraceback}
            className="text-sm font-medium text-brand underline underline-offset-2 hover:text-brand-dark"
          >
            {showTraceback ? "Hide" : "Show"} what Python actually said
          </button>
          {showTraceback && (
            <pre className="mt-2 overflow-x-auto rounded border border-rule bg-paper p-3 text-xs leading-relaxed">
              {error.traceback}
            </pre>
          )}
        </div>
      )}
    </Callout>
  );
}

function CheckFeedback({ result }: { result: ExecutionResult }) {
  const passed = result.checks.filter((check) => check.passed).length;
  const total = result.checks.length;

  return (
    <Callout
      tone={result.passed ? "pass" : "fail"}
      symbol={result.passed ? "✓" : "✕"}
      heading={
        result.passed
          ? total === 1
            ? "That's it — this exercise is done"
            : `That's it — all ${total} checks pass`
          : `${passed} of ${total} checks pass`
      }
    >
      {!result.passed && (
        <p className="mb-3">
          Your program ran without errors, so this is about what it produced rather than how it is
          written.
        </p>
      )}

      <ul className="space-y-2">
        {result.checks.map((check, index) => (
          <CheckRow key={index} check={check} />
        ))}
      </ul>
    </Callout>
  );
}

function CheckRow({ check }: { check: CheckResult }) {
  const showComparison =
    !check.passed &&
    check.expected !== null &&
    check.actual !== null &&
    check.expected.length < 400;

  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className={check.passed ? "text-pass" : "text-fail"}>
        {check.passed ? "✓" : check.status === "not_run" ? "–" : "✕"}
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">
          {check.passed ? "Passed: " : check.status === "not_run" ? "Not checked: " : "Failed: "}
        </span>
        <span className={check.passed ? "text-ink-soft" : "font-medium"}>{check.label}</span>

        {check.detail && !check.passed && (
          <p className="mt-1 text-sm text-ink-soft">{check.detail}</p>
        )}

        {showComparison && (
          <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[max-content_1fr]">
            <dt className="font-semibold text-ink-soft">Expected</dt>
            <dd>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-paper px-2 py-1">
                {check.expected}
              </pre>
            </dd>
            <dt className="font-semibold text-ink-soft">Your program</dt>
            <dd>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-paper px-2 py-1">
                {check.actual || "(nothing)"}
              </pre>
            </dd>
          </dl>
        )}
      </div>
    </li>
  );
}

const TONES = {
  pass: "border-pass/40 bg-pass-wash text-ink",
  fail: "border-fail/40 bg-fail-wash text-ink",
  warn: "border-warn/40 bg-warn-wash text-ink",
  neutral: "border-rule bg-paper-sunk text-ink",
} as const;

const SYMBOL_TONES = {
  pass: "text-pass",
  fail: "text-fail",
  warn: "text-warn",
  neutral: "text-ink-soft",
} as const;

function Callout({
  tone,
  symbol,
  heading,
  children,
}: {
  tone: keyof typeof TONES;
  symbol: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      // The output pane is also a live region, so tests need to be able to
      // address the feedback specifically.
      data-testid="feedback"
      className={`mt-4 rounded border p-4 ${TONES[tone]}`}
    >
      <h4 className="flex items-start gap-2 font-semibold">
        <span aria-hidden="true" className={SYMBOL_TONES[tone]}>
          {symbol}
        </span>
        {heading}
      </h4>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
