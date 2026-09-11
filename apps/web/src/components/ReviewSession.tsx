"use client";

/**
 * One sitting of retrieval practice (Section 2.4, Section 6 feature 7).
 *
 * The shape of this component is the pedagogy:
 *
 *   * One item on screen at a time. Retrieval practice is effortful recall, and
 *     a page of visible questions lets the eye borrow answers from the others.
 *
 *   * The answer is not in the browser until the learner has committed to one.
 *     `api.answerReview` sends the choice and gets the verdict back; nothing in
 *     the due-queue response could be read out of developer tools to shortcut it.
 *
 *   * There is no advancing past a wrong answer without the explanation being on
 *     screen. Being told "wrong" and moved along teaches nothing; being told why
 *     is the entire value of the exercise.
 *
 *   * The explanation appears for correct answers too. A learner who guessed and
 *     happened to be right has learned nothing from a bare tick.
 *
 * Colour never carries meaning alone (Section 8): each verdict has a word and a
 * symbol as well.
 */

import { useState } from "react";
import Link from "next/link";

import { Markdown } from "@/components/Markdown";
import { ApiError, api, type ApiQuizResult, type ApiReviewItem } from "@/lib/api";

interface Answered {
  item: ApiReviewItem;
  chosen: string;
  result: ApiQuizResult;
}

export function ReviewSession({ items }: { items: ApiReviewItem[] }) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<ApiQuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Answered[]>([]);

  const item = items[index];

  if (!item) {
    return <Finished history={history} />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!item || chosen === null || result !== null) return;

    setSubmitting(true);
    setError(null);
    try {
      const verdict = await api.answerReview({ quiz_item_id: item.id, answer: chosen });
      setResult(verdict);
      setHistory((previous) => [...previous, { item, chosen, result: verdict }]);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That answer could not be sent. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function next() {
    setIndex((current) => current + 1);
    setChosen(null);
    setResult(null);
    setError(null);
  }

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Question {index + 1} of {items.length}
      </p>

      <article className="mt-4 rounded-lg border border-rule p-6">
        <p className="text-sm text-ink-soft">
          {item.seen_before ? "Seen before, from " : "From "}
          <span className="font-medium text-ink">{item.module_title}</span>
          {item.reviews_module_slug && " — this one looks further back still."}
        </p>

        <div className="mt-3">
          <Markdown>{item.prompt_markdown}</Markdown>
        </div>

        {item.code && (
          <pre className="mt-4 overflow-x-auto rounded border border-rule bg-paper-sunk p-4 text-sm leading-relaxed">
            <code>{item.code}</code>
          </pre>
        )}

        <form onSubmit={submit} className="mt-5">
          <fieldset disabled={result !== null || submitting}>
            <legend className="sr-only">Choose an answer</legend>
            <ul className="space-y-2">
              {item.options.map((option) => {
                const id = `option-${item.id}-${option.slice(0, 24)}`;
                return (
                  <li key={option}>
                    <label
                      htmlFor={id}
                      className={`flex cursor-pointer gap-3 rounded border p-3 text-sm ${
                        chosen === option ? "border-brand bg-paper-sunk" : "border-rule"
                      }`}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={`item-${item.id}`}
                        value={option}
                        checked={chosen === option}
                        onChange={() => setChosen(option)}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]"
                      />
                      <Markdown className="lp-prose-inline inline">{option}</Markdown>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded border border-fail/40 bg-fail-wash px-3 py-2 text-sm"
            >
              {error}
            </p>
          )}

          {result === null ? (
            <button
              type="submit"
              disabled={chosen === null || submitting}
              className="mt-5 rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {submitting ? "Checking…" : "Check answer"}
            </button>
          ) : null}
        </form>

        {result && <Verdict result={result} onNext={next} last={index === items.length - 1} />}
      </article>
    </div>
  );
}

function Verdict({
  result,
  onNext,
  last,
}: {
  result: ApiQuizResult;
  onNext: () => void;
  last: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="review-verdict"
      className={`mt-5 rounded border p-4 ${
        result.correct ? "border-pass/40 bg-pass-wash" : "border-fail/40 bg-fail-wash"
      }`}
    >
      <h3 className="flex items-start gap-2 font-semibold">
        <span aria-hidden="true" className={result.correct ? "text-pass" : "text-fail"}>
          {result.correct ? "✓" : "✕"}
        </span>
        {result.correct ? "Correct" : "Not this time"}
      </h3>

      {!result.correct && (
        <p className="mt-2 text-sm">
          The answer is: <Markdown className="lp-prose-inline inline">{result.answer}</Markdown>
        </p>
      )}

      {result.explanation_markdown && (
        <div className="mt-3 text-sm leading-relaxed">
          <Markdown>{result.explanation_markdown}</Markdown>
        </div>
      )}

      <p className="mt-3 text-sm text-ink-soft">
        {result.interval_days === 1
          ? "You'll see this one again tomorrow."
          : `You'll see this one again in ${result.interval_days} days.`}
      </p>

      <button
        type="button"
        onClick={onNext}
        autoFocus
        className="mt-4 rounded border border-rule bg-paper px-4 py-2 text-sm font-medium hover:border-brand"
      >
        {last ? "Finish" : "Next question"}
      </button>
    </div>
  );
}

function Finished({ history }: { history: Answered[] }) {
  const right = history.filter((entry) => entry.result.correct).length;

  return (
    <div className="rounded-lg border border-rule p-6">
      <h2 className="text-lg font-semibold">Done for now</h2>
      <p className="mt-2 text-ink-soft">
        {history.length === 0
          ? "Nothing to review."
          : `${right} of ${history.length} right. Everything you saw is scheduled to come back — the ones you missed, soonest.`}
      </p>
      <p className="mt-4 text-sm text-ink-soft">
        Reviews appear as they fall due. There is nothing to keep up with here; when the queue is
        empty, it is empty.
      </p>
      <Link
        href="/learn"
        className="mt-5 inline-block rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Back to the curriculum
      </Link>
    </div>
  );
}
