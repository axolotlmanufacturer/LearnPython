"use client";

/**
 * Self-assessment for open-ended work (Section 6, feature 10).
 *
 * A capstone is judged partly on things no automated check can see: whether the
 * work is organised into functions, whether the names say what they mean,
 * whether the failures the learner chose to anticipate are actually handled.
 * The honest way to grade that on a self-directed platform is to name the
 * criteria and let the learner judge their own work against them.
 *
 * Deliberately not scored, not persisted, and not gating anything. A checklist
 * that awarded marks would invite ticking boxes; one that just asks the
 * questions invites rereading the code, which is the point.
 */

import { useState } from "react";

import { Markdown } from "@/components/Markdown";

export function RubricChecklist({
  criteria,
  exerciseSlug,
}: {
  criteria: string[];
  exerciseSlug: string;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  if (criteria.length === 0) return null;

  const toggle = (index: number) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <section
      aria-labelledby={`rubric-${exerciseSlug}`}
      className="mt-5 rounded border border-rule bg-paper-sunk p-4"
    >
      <h4 id={`rubric-${exerciseSlug}`} className="text-sm font-semibold">
        Check your own work
      </h4>
      <p className="mt-1 text-sm text-ink-soft">
        The checks above can only see what your program does. These are the things worth rereading
        your code for. Nothing here is marked or saved.
      </p>

      <ul className="mt-3 space-y-2">
        {criteria.map((criterion, index) => {
          const id = `rubric-${exerciseSlug}-${index}`;
          return (
            <li key={index} className="flex gap-2.5">
              <input
                id={id}
                type="checkbox"
                checked={checked.has(index)}
                onChange={() => toggle(index)}
                className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
              />
              <label htmlFor={id} className="text-sm">
                <Markdown className="lp-prose-inline inline">{criterion}</Markdown>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-sm text-ink-soft">
        {checked.size} of {criteria.length} checked.
      </p>
    </section>
  );
}
