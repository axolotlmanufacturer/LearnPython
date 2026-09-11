import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "@/components/Markdown";
import { ApiError, api } from "@/lib/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ module: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { module: moduleSlug } = await params;
  try {
    const moduleData = await api.module(moduleSlug);
    return { title: moduleData.title };
  } catch {
    return { title: "Module" };
  }
}

/** Bloom levels, shown so a learner can see the shape of what is being asked. */
const BLOOM_LABELS: Record<string, string> = {
  remember: "Recall",
  understand: "Understand",
  apply: "Apply",
  analyze: "Analyse",
  evaluate: "Evaluate",
  create: "Create",
};

export default async function ModulePage({ params }: Params) {
  const { module: moduleSlug } = await params;

  let moduleData;
  try {
    moduleData = await api.module(moduleSlug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm text-ink-soft">
        <Link href="/learn" className="hover:text-brand">
          Curriculum
        </Link>{" "}
        <span aria-hidden="true">/</span> Module {moduleData.position}
      </p>

      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{moduleData.title}</h1>

      <div className="mt-4 max-w-2xl text-lg text-ink-soft">
        <Markdown>{moduleData.summary_markdown}</Markdown>
      </div>

      <section aria-labelledby="objectives" className="mt-10 rounded-lg bg-paper-sunk p-6">
        <h2 id="objectives" className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          By the end of this module you will be able to
        </h2>
        <ul className="mt-4 space-y-2.5">
          {moduleData.objectives.map((objective, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span className="mt-0.5 w-20 shrink-0 text-xs font-medium uppercase tracking-wide text-ink-soft">
                {BLOOM_LABELS[objective.bloom] ?? objective.bloom}
              </span>
              <span>{objective.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="lessons" className="mt-10">
        <h2 id="lessons" className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
          Lessons
        </h2>
        <ol className="mt-4 space-y-3">
          {moduleData.lessons.map((lesson) => (
            <li key={lesson.slug}>
              <Link
                href={`/learn/${moduleData.slug}/${lesson.slug}`}
                className="group flex items-baseline gap-4 rounded-lg border border-rule px-5 py-4 hover:border-brand"
              >
                <span className="text-sm tabular-nums text-ink-soft">{lesson.position}</span>
                <span className="flex-1 font-medium group-hover:text-brand">{lesson.title}</span>
                <span className="whitespace-nowrap text-sm text-ink-soft">
                  {lesson.exercise_count} {lesson.exercise_count === 1 ? "exercise" : "exercises"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
