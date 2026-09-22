"use client";

/**
 * Whether this component is running with React attached, as opposed to being
 * server-rendered HTML that has not been hydrated yet.
 *
 * Exists for the Run buttons. Lesson pages are server-rendered, so the button
 * is on screen — and looks clickable — before the JavaScript that handles the
 * click has arrived. A learner on a slow connection who pressed Run in that gap
 * got nothing at all: no output, no error, no sign the press registered. The
 * end-to-end suite found it by clicking faster than hydration. Rendering the
 * button disabled until this returns true turns a silently swallowed click into
 * a button that visibly becomes ready.
 *
 * `useSyncExternalStore` with different server and client snapshots is React's
 * supported way to express "false during SSR and hydration, true afterwards"
 * without a hydration mismatch or an extra render in an effect.
 */

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
