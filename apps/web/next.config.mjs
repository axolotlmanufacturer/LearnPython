/** @type {import('next').NextConfig} */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// The browser talks only to the Next.js origin; Next proxies /api/* to FastAPI.
// This keeps the session cookie same-origin and avoids the entire class of
// cross-site cookie problems. See docs/architecture.md §6.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

// The Pyodide distribution is ~14 MB per cold load, which on a free hosting tier
// is essentially the entire bandwidth budget: 100 GB/month is about 7,000
// first-time learners and nothing else. jsDelivr serves the official Pyodide
// builds free and unmetered, so that is the default and self-hosting is the
// opt-in. See docs/architecture.md §1.1 and docs/deployment.md.
//
// The version is read from the installed npm package at build time rather than
// written by hand, so the CDN cannot serve a different interpreter than the one
// CI graded against.
const PYODIDE_VERSION = require("pyodide/package.json").version;
const PYODIDE_INDEX_URL =
  process.env.PYODIDE_INDEX_URL ?? `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

if (!PYODIDE_INDEX_URL.endsWith("/")) {
  throw new Error(
    `PYODIDE_INDEX_URL must end with "/" — Pyodide resolves its assets against it as a base. Got: ${PYODIDE_INDEX_URL}`,
  );
}

const nextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_PYODIDE_INDEX_URL: PYODIDE_INDEX_URL,
    NEXT_PUBLIC_PYODIDE_VERSION: PYODIDE_VERSION,
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },

  async headers() {
    const immutable = { key: "Cache-Control", value: "public, max-age=31536000, immutable" };

    // The interpreter's origin has to be allowed explicitly, and it is not
    // always ours — see PYODIDE_INDEX_URL above. Derived from the configured URL
    // so the policy cannot drift from where the assets actually come from.
    const pyodideOrigin = PYODIDE_INDEX_URL.startsWith("http")
      ? new URL(PYODIDE_INDEX_URL).origin
      : "";

    /**
     * Content Security Policy.
     *
     * This application's entire purpose is executing code the user wrote, which
     * makes the usual advice ("never allow unsafe-eval") the wrong shape. The
     * useful question is not whether arbitrary code runs — it does, by design —
     * but what it can reach.
     *
     * `wasm-unsafe-eval` is what WebAssembly compilation needs, and it is
     * strictly narrower than `unsafe-eval`: it permits instantiating a WASM
     * module and nothing else, so it does not re-enable `eval()` on strings.
     * The interpreter runs in a worker with no DOM and no session cookie, and
     * `connect-src` stops learner code from posting anything anywhere.
     *
     * `'unsafe-inline'` for styles is Next.js and CodeMirror injecting styles at
     * runtime. Removing it needs a nonce threaded through both, which buys very
     * little on a site with no user-authored HTML.
     */
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${pyodideOrigin}`.trim(),
      `worker-src 'self' blob:`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // Same-origin for the API (it is proxied through this origin), plus
      // wherever the interpreter is served from. Nothing else — learner code
      // cannot exfiltrate to a third party.
      `connect-src 'self' ${pyodideOrigin}`.trim(),
      // Nothing here should ever be framed, and this page should never frame
      // anything: both directions are attack surface with no feature behind them.
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    const security = [
      { key: "Content-Security-Policy", value: csp },
      // Redundant with frame-ancestors for modern browsers, kept for older ones.
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // The platform asks for none of these; saying so explicitly means a future
      // dependency cannot quietly start asking on our behalf.
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ];

    return [
      { source: "/:path*", headers: security },
      {
        // Only present when self-hosting the distribution. Immutable per version.
        source: "/pyodide/:path*",
        headers: [immutable],
      },
      {
        // The worker and the grading harness are always same-origin, but they are
        // a few tens of kilobytes rather than megabytes. They are versioned with
        // the deployment, so they are revalidated rather than cached forever.
        source: "/python/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
