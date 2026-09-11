/**
 * The site navigation.
 *
 * A server component that is *given* the signed-in learner rather than fetching
 * one: the marketing pages pass `null` and stay static, while the learning
 * pages pass the session their layout already resolved. Only the sign-out
 * control needs the browser, so only that is a client component.
 */

import Link from "next/link";

import { SignOutButton } from "@/components/SignOutButton";
import type { ApiUser } from "@/lib/api";

export function SiteHeader({ user }: { user: ApiUser | null }) {
  return (
    <header className="border-b border-rule">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3"
      >
        <Link href="/" className="font-semibold tracking-tight">
          LearnPython
        </Link>

        <div className="flex items-center gap-5 text-sm">
          <Link href="/learn" className="hover:text-brand">
            Curriculum
          </Link>

          {user ? (
            <>
              <span className="hidden text-ink-soft sm:inline" data-testid="signed-in-as">
                {user.display_name || user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="hover:text-brand">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded bg-brand px-3.5 py-1.5 font-medium text-white hover:bg-brand-dark"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
