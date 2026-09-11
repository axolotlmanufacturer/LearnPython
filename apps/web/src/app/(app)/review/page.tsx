import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReviewSession } from "@/components/ReviewSession";
import { serverApi } from "@/lib/api.server";
import { getCurrentUser } from "@/lib/session.server";

export const metadata: Metadata = { title: "Review" };
export const dynamic = "force-dynamic";

/**
 * The review queue.
 *
 * Server-rendered with the first batch already fetched, so the page arrives
 * ready to answer rather than showing a spinner — and the answers are not in
 * the payload either way, because the server withholds them until a choice is
 * submitted.
 */
export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/review");

  const items = await serverApi.dueReviews();

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Review</h1>
      <p className="mt-3 text-ink-soft">
        A few questions on things you have already worked through. Recalling something is what makes
        it stick — far more than reading it again.
      </p>

      {items === null ? (
        <p role="alert" className="mt-8 rounded border border-fail/40 bg-fail-wash px-4 py-3">
          The review queue could not be loaded. Try again in a moment.
        </p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-lg border border-rule p-6">
          <h2 className="font-semibold">Nothing due</h2>
          <p className="mt-2 text-ink-soft">
            Questions appear here once you finish a module, and come back on a widening schedule
            after that. An empty queue means you are up to date — not that you are behind.
          </p>
          <Link
            href="/learn"
            className="mt-5 inline-block rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Carry on learning
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ReviewSession items={items} />
        </div>
      )}
    </main>
  );
}
