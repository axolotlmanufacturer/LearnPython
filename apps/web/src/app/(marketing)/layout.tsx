import { SiteHeader } from "@/components/SiteHeader";

/**
 * The pages a visitor sees before they have an account: landing, sign in, sign
 * up. Nothing here reads the request, so these routes prerender as static HTML
 * and are served from the edge cache rather than a server invocation — which is
 * what keeps the platform inside a free hosting tier's limits.
 *
 * The consequence, accepted deliberately: the header on these pages always
 * offers "Sign in" even to someone who is already signed in. They are pages you
 * pass through once, and the alternative is making the most-visited page in the
 * product dynamic to personalise a link.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader user={null} />
      <div className="flex-1">{children}</div>
    </>
  );
}
