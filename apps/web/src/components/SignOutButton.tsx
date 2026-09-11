"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.logout();
          router.push("/");
          // The session lives in a cookie the server reads, so the server tree
          // has to be re-rendered for the navigation to reflect the sign-out.
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="hover:text-brand disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
