import "server-only";

/**
 * Authenticated reads during server rendering.
 *
 * The browser client in `lib/api.ts` relies on the session cookie travelling
 * automatically with a same-origin request. During server rendering there is no
 * browser to do that, so the cookie has to be forwarded by hand — which is what
 * separates this module from that one, and why it is `server-only`: importing
 * `next/headers` into a component that also runs in the browser would not build.
 *
 * Every function here returns `null` rather than throwing. These are all
 * *supplementary* reads — a streak, a review count, a badge — and a learner
 * whose curriculum page renders without a streak because the API hiccuped is in
 * a far better position than one looking at an error page. The caller decides
 * what to show for `null`, and in every case the answer is "nothing".
 *
 * Reading cookies opts the route into dynamic rendering. That is already true of
 * everything under the (app) group, whose layout resolves a session; the
 * marketing pages never call any of this and stay static.
 */

import { cookies } from "next/headers";

import type { ApiModuleProgress, ApiReviewItem, ApiSummary, ApiUser } from "./api";

async function authenticatedGet<T>(path: string): Promise<T | null> {
  const origin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
  const cookieHeader = (await cookies()).toString();
  // No cookies at all means nobody is signed in; skip the round trip.
  if (!cookieHeader) return null;

  try {
    const response = await fetch(`${origin}${path}`, {
      headers: { cookie: cookieHeader },
      // Per-learner data, so never reused between requests.
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // The API being unreachable should degrade to "nothing to show", not a
    // crash on every page of the site.
    return null;
  }
}

export const serverApi = {
  me: () => authenticatedGet<ApiUser>("/api/auth/me"),
  summary: () => authenticatedGet<ApiSummary>("/api/progress/summary"),
  moduleProgress: () => authenticatedGet<ApiModuleProgress[]>("/api/progress/modules"),
  dueReviews: () => authenticatedGet<ApiReviewItem[]>("/api/quiz/due"),
};
