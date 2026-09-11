import "server-only";

/**
 * Resolves the signed-in learner during server rendering.
 *
 * Doing this on the server rather than from an effect in the browser means the
 * navigation renders correct on the first paint — no flash of "Sign in" for
 * someone who is already signed in — and saves a round trip on every page load.
 *
 * Reading cookies opts a route into dynamic rendering, so only the routes that
 * actually need a session call this: the marketing and auth pages are in a
 * separate route group whose layout never asks. That keeps the pages a visitor
 * sees first static and edge-cacheable, which matters on a free hosting tier
 * where server invocations are metered alongside bandwidth.
 *
 * Wrapped in `cache()` so a layout and the page inside it can both ask without
 * making two requests.
 */

import { cache } from "react";
import { cookies } from "next/headers";

import type { ApiUser } from "./api";

export const getCurrentUser = cache(async (): Promise<ApiUser | null> => {
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
});
