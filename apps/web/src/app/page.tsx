import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">LearnPython</h1>
      <p className="mt-4 text-lg text-ink-soft">
        Learn Python from zero. Every exercise runs in your browser — nothing to install, and
        nothing you can break.
      </p>
      <p className="mt-10">
        <Link
          href="/health"
          className="rounded bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark"
        >
          Check platform status
        </Link>
      </p>
    </main>
  );
}
