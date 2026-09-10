import type { Metadata } from "next";

import { SessionProvider } from "@/components/SessionProvider";
import { getCurrentUser } from "@/lib/session.server";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LearnPython",
    template: "%s · LearnPython",
  },
  description: "Learn Python from zero, in your browser.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="flex min-h-full flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <SessionProvider initialUser={user}>
          <SiteHeader />
          <div className="flex-1">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
