import type { Metadata } from "next";

import "./globals.css";

/**
 * The root layout deliberately reads nothing per-request — no cookies, no fetch.
 * That is what lets the marketing and auth pages render statically; the pages
 * that need a session resolve it in the (app) route group's layout instead.
 */

export const metadata: Metadata = {
  title: {
    default: "LearnPython",
    template: "%s · LearnPython",
  },
  description: "Learn Python from zero, in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
