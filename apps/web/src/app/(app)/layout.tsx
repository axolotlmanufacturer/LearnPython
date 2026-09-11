import { SiteHeader } from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/session.server";

/**
 * The signed-in experience. These routes read the session cookie, so they render
 * per request — which is correct: they show a learner their own progress.
 *
 * `getCurrentUser` is request-cached, so a page inside this layout can ask for
 * the same session without a second call to the API.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <>
      <SiteHeader user={user} />
      <div className="flex-1">{children}</div>
    </>
  );
}
