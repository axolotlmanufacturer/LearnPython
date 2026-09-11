/**
 * Quiet recognition of work already done (Section 6, feature 9).
 *
 * The brief asks for streaks and badges and, in the same breath, for them to
 * stay understated and free of manipulative engagement mechanics. Three rules
 * follow from that, and they are the whole design:
 *
 *   1. **Nothing is shown until there is something to show.** A learner on day
 *      one sees no counters at all. A zero on a dashboard is an invitation to
 *      feel behind before starting.
 *
 *   2. **A lapsed streak is silent.** The API reports 0 and does not say what
 *      the streak had been, so there is nothing here to say "you lost your
 *      12-day streak" with. Someone coming back after a fortnight away is
 *      returning, not failing.
 *
 *   3. **No targets, no comparisons, no urgency.** Every number is a count of
 *      something the learner actually did. There is no goal to fall short of
 *      and nobody else's figures to measure against.
 *
 * Rendered on the server: it is a read of the learner's own rows, and a strip
 * that popped in after hydration would be more attention-grabbing than the
 * thing it reports deserves.
 */

import Link from "next/link";

import type { ApiSummary } from "@/lib/api";

export function ProgressSummary({ summary }: { summary: ApiSummary | null }) {
  if (!summary) return null;

  const facts: string[] = [];
  if (summary.streak_days > 0) {
    facts.push(
      summary.streak_days === 1 ? "Practised today" : `${summary.streak_days} days in a row`,
    );
  }
  if (summary.exercises_passed > 0) {
    facts.push(
      summary.exercises_passed === 1
        ? "1 exercise solved"
        : `${summary.exercises_passed} exercises solved`,
    );
  }
  if (summary.completed_module_slugs.length > 0) {
    facts.push(
      summary.completed_module_slugs.length === 1
        ? "1 module finished"
        : `${summary.completed_module_slugs.length} modules finished`,
    );
  }

  // Nothing done yet and nothing due: say nothing at all.
  if (facts.length === 0 && summary.reviews_due === 0) return null;

  return (
    <section
      aria-label="Your progress"
      className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-rule bg-paper-sunk px-5 py-4 text-sm"
    >
      {facts.length > 0 && (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ink-soft">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      )}

      {summary.reviews_due > 0 && (
        <Link href="/review" className="ml-auto font-medium text-brand hover:text-brand-dark">
          {summary.reviews_due === 1
            ? "1 question to review"
            : `${summary.reviews_due} questions to review`}
          <span aria-hidden="true"> →</span>
        </Link>
      )}
    </section>
  );
}
