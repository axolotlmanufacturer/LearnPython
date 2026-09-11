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
    return [
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
