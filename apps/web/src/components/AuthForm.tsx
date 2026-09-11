"use client";

/**
 * Sign-up and sign-in share a form; only the labels and the endpoint differ.
 *
 * Errors are shown next to the form and announced, not thrown away in a toast —
 * "that email is already registered" is information a person needs while they
 * are still looking at the field.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, api } from "@/lib/api";

export function AuthForm({ mode }: { mode: "sign-up" | "sign-in" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signingUp = mode === "sign-up";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (signingUp) {
        await api.register({
          email,
          password,
          ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
        });
      } else {
        await api.login({ email, password });
      }
      router.push("/learn");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        {signingUp ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-2 text-ink-soft">
        {signingUp
          ? "So your progress is here next time you come back."
          : "Welcome back — pick up where you left off."}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        {error && (
          <p
            role="alert"
            className="rounded border border-fail/40 bg-fail-wash px-3 py-2 text-sm"
            data-testid="auth-error"
          >
            {error}
          </p>
        )}

        {signingUp && (
          <Field
            id="display-name"
            label="What should we call you?"
            hint="Optional."
            value={displayName}
            onChange={setDisplayName}
            autoComplete="nickname"
          />
        )}

        <Field
          id="email"
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />

        <Field
          id="password"
          label="Password"
          type="password"
          hint={signingUp ? "At least 10 characters. Length matters more than symbols." : undefined}
          value={password}
          onChange={setPassword}
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
        />

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {submitting ? "Just a moment…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-soft">
        {signingUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-brand underline underline-offset-2">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href="/sign-up" className="text-brand underline underline-offset-2">
              Create an account
            </Link>
          </>
        )}
      </p>
    </main>
  );
}

function Field({
  id,
  label,
  hint,
  type = "text",
  value,
  onChange,
  autoComplete,
  required = false,
}: {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-xs text-ink-soft">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        aria-describedby={hintId}
        className="mt-1.5 w-full rounded border border-rule bg-paper px-3 py-2 focus:border-brand"
      />
    </div>
  );
}
