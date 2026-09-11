import type { Metadata } from "next";
import Link from "next/link";

import { Markdown } from "@/components/Markdown";
import { api, type ApiTrack } from "@/lib/api";

export const metadata: Metadata = { title: "Curriculum" };
export const dynamic = "force-dynamic";

export default async function LearnPage() {
  let tracks: ApiTrack[] = [];
  let failed = false;
  try {
    tracks = await api.tracks();
  } catch {
    failed = true;
  }

  return (
    <main id="main" className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Curriculum</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Work through the modules in order. Each one assumes the ones before it and nothing else.
      </p>

      {failed && (
        <p role="alert" className="mt-8 rounded border border-fail/40 bg-fail-wash px-4 py-3">
          The curriculum could not be loaded. If you are running this locally, check that the API is
          running and that <code>make content-load</code> has been run.
        </p>
      )}

      {tracks.map((track) => (
        <section key={track.slug} aria-labelledby={`track-${track.slug}`} className="mt-12">
          <h2 id={`track-${track.slug}`} className="text-xl font-semibold">
            {track.title}
          </h2>
          {track.prerequisite_slug && (
            <p className="mt-1 text-sm text-ink-soft">
              Continues on from{" "}
              {tracks.find((t) => t.slug === track.prerequisite_slug)?.title ??
                track.prerequisite_slug}
              .
            </p>
          )}
          <div className="mt-2 max-w-2xl text-ink-soft">
            <Markdown>{track.summary_markdown}</Markdown>
          </div>

          {track.modules.length === 0 ? (
            <p className="mt-5 rounded border border-dashed border-rule px-4 py-6 text-sm text-ink-soft">
              Not written yet. This track is planned but has no modules so far.
            </p>
          ) : (
            <ol className="mt-5 space-y-3">
              {track.modules.map((module) => (
                <li key={module.slug}>
                  <Link
                    href={`/learn/${module.slug}`}
                    className="group flex items-baseline gap-4 rounded-lg border border-rule px-5 py-4 hover:border-brand"
                  >
                    <span className="text-sm tabular-nums text-ink-soft">
                      {String(module.position).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium group-hover:text-brand">{module.title}</span>
                      <span className="mt-1 block text-sm text-ink-soft">
                        {module.summary_markdown}
                      </span>
                    </span>
                    <span className="hidden whitespace-nowrap text-sm text-ink-soft sm:block">
                      {module.lesson_count} {module.lesson_count === 1 ? "lesson" : "lessons"}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </main>
  );
}
