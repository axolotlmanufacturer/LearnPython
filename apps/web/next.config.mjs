/** @type {import('next').NextConfig} */

// The browser talks only to the Next.js origin; Next proxies /api/* to FastAPI.
// This keeps the session cookie same-origin and avoids the entire class of
// cross-site cookie problems. See docs/architecture.md §6.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // Pyodide assets are immutable per version and large (~14 MB). Cache hard.
        source: "/pyodide/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
