/**
 * Phase 0 wiring proof: the frontend reaches the backend through the /api rewrite.
 * Kept past Phase 0 as a genuinely useful deployment smoke check.
 */
export const dynamic = "force-dynamic";

type ApiHealth = { status: string; service: string; version: string; database: string };

async function fetchApiHealth(): Promise<ApiHealth | { error: string }> {
  const origin = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${origin}/api/health`, { cache: "no-store" });
    if (!res.ok) return { error: `API responded ${res.status}` };
    return (await res.json()) as ApiHealth;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "unreachable" };
  }
}

export default async function HealthPage() {
  const health = await fetchApiHealth();
  const ok = !("error" in health);

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Platform status</h1>
      <dl className="mt-8 divide-y divide-rule border-y border-rule">
        <div className="flex justify-between gap-6 py-3">
          <dt className="text-ink-soft">Web app</dt>
          <dd className="font-medium text-pass">Running</dd>
        </div>
        <div className="flex justify-between gap-6 py-3">
          <dt className="text-ink-soft">API</dt>
          <dd className={`font-medium ${ok ? "text-pass" : "text-fail"}`}>
            {ok ? `Running (v${health.version})` : `Unreachable — ${health.error}`}
          </dd>
        </div>
        {ok && (
          <div className="flex justify-between gap-6 py-3">
            <dt className="text-ink-soft">Database</dt>
            <dd
              className={`font-medium ${health.database === "connected" ? "text-pass" : "text-fail"}`}
            >
              {health.database}
            </dd>
          </div>
        )}
      </dl>
    </main>
  );
}
