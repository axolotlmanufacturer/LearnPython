"use client";

/**
 * Tracks who is signed in, for the client components that need to know.
 *
 * The server already knows from the cookie on every request; this exists so the
 * navigation and the progress-saving calls do not each have to ask.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { api, type ApiUser } from "@/lib/api";

interface SessionValue {
  user: ApiUser | null;
  /** Re-read the session after signing in. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  initialUser,
  children,
}: {
  /** Resolved on the server (see lib/session.server.ts), so the first paint is
   * already correct and there is no effect fetching it after hydration. */
  initialUser: ApiUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<ApiUser | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      // A 401 here is the ordinary signed-out case, not an error worth surfacing.
      setUser(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, refresh, signOut }), [user, refresh, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside a SessionProvider.");
  return context;
}
