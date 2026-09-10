"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/SessionProvider";

export function SiteHeader() {
  const { user, signOut } = useSession();
  const router = useRouter();

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
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
                className="hover:text-brand"
              >
                Sign out
              </button>
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
