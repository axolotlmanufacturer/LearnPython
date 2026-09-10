import "server-only";

/**
 * Resolves the signed-in learner during server rendering.
 *
 * Doing this on the server rather than from an effect in the browser means the
 * navigation renders correct on the first paint — no flash of "Sign in" for
 * someone who is already signed in — and saves a round trip on every page load.
 *
 * The cost, stated so it is a decision rather than an accident: reading cookies
 * opts every route that renders the root layout into dynamic rendering, so the
 * marketing page is server-rendered per request instead of static. At MVP scale
 * that is a fair trade for a correct first paint; if the landing page ever
 * needs to be statically served at the edge, the header becomes a separate
 * client island and this moves with it.
 */

import { cookies } from "next/headers";

import type { ApiUser } from "./api";

export async function getCurrentUser(): Promise<ApiUser | null> {
  const origin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  try {
    const response = await fetch(`${origin}/api/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as ApiUser;
  } catch {
    // The API being unreachable should degrade to "signed out", not a crash on
    // every page of the site.
    return null;
  }
}
