import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Learn Python from nothing.
      </h1>

      <p className="mt-5 text-lg leading-relaxed text-ink-soft">
        No prior programming experience assumed and nothing to install. Every exercise runs in your
        own browser, so you can break things freely — the worst that happens is an error message,
        and reading those is half of what you are here to learn.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        <Link
          href="/sign-up"
          className="rounded bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark"
        >
          Start at the beginning
        </Link>
        <Link
          href="/learn"
          className="text-brand underline underline-offset-2 hover:text-brand-dark"
        >
          Look at the curriculum first
        </Link>
      </div>

      <section aria-labelledby="how-heading" className="mt-16 border-t border-rule pt-10">
        <h2
          id="how-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink-soft"
        >
          How it works
        </h2>
        <dl className="mt-6 grid gap-8 sm:grid-cols-3">
          <div>
            <dt className="font-medium">Read a little</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              One or two new ideas at a time, each with a worked example you can run before you are
              asked to write anything.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Write a little</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Exercises start by filling in blanks and end with writing programs from a description,
              as you need less help.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Find out immediately</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              Feedback in under a second, and when something breaks, an explanation of why — not
              just a traceback.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
