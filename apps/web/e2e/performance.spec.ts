/**
 * Core Web Vitals and transfer cost (Section 8, and the MVP criterion in §11).
 *
 * §11 asks for performance to be *documented*. A number someone measured once
 * and pasted into a document is out of date by the next commit, so the numbers
 * live here, are re-measured on every run, and the run fails if they move
 * outside the band. `docs/performance.md` records what a representative run
 * produced and, more usefully, why the thresholds are where they are.
 *
 * What these numbers are and are not
 * ----------------------------------
 * This is a headless browser talking to a server on the same machine. There is
 * no network latency, no CPU contention from other tabs, and no mobile
 * throttling, so the absolute figures are optimistic by a wide margin against a
 * learner on a laptop over home broadband. What the measurement is good for is
 * *layout* and *payload*: cumulative layout shift is a property of the code and
 * transfers essentially the same way everywhere, and bytes shipped are bytes
 * shipped. Those are asserted tightly. Timing is asserted loosely, as a
 * regression tripwire rather than a claim about what a learner experiences.
 *
 * The honest headline is in docs/performance.md: on this platform the ~14 MB
 * interpreter dwarfs everything measured here, and the work that matters is
 * keeping it off the critical path rather than shaving kilobytes off the app.
 */
import { expect, test, type Page } from "@playwright/test";

interface Vitals {
  /** Largest Contentful Paint, ms from navigation start. */
  lcp: number;
  /** Cumulative Layout Shift, unitless. */
  cls: number;
  /** Time to first byte, ms. */
  ttfb: number;
  /** Bytes over the wire for the document and its subresources. */
  transferred: number;
  /** Bytes of JavaScript specifically, which is the part we control. */
  scriptBytes: number;
}

/**
 * Collect vitals for a page load.
 *
 * The observers are installed via an init script so they are running before the
 * first paint — registering them after `goto` would miss the entries that matter,
 * and `buffered: true` does not cover layout shifts that already happened.
 */
async function measure(page: Page, path: string): Promise<Vitals> {
  await page.addInitScript(() => {
    const store = { lcp: 0, cls: 0 };
    (window as unknown as { __vitals: typeof store }).__vitals = store;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        store.lcp = Math.max(store.lcp, entry.startTime);
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        // Shifts within 500ms of a user interaction are excluded from CLS by
        // definition: the user asked for the change.
        if (!entry.hadRecentInput) store.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto(path, { waitUntil: "networkidle" });

  return page.evaluate(() => {
    const store = (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

    // The interpreter is excluded from the app's byte budget on purpose: it is
    // fetched from a CDN, cached across the whole site for a year, and is
    // accounted for separately in docs/performance.md. Folding it in would hide
    // every change to the app's own payload behind one 14 MB number.
    const appResources = resources.filter(
      (resource) => !/\/pyodide\/|cdn\.jsdelivr\.net/.test(resource.name),
    );

    return {
      lcp: Math.round(store.lcp),
      cls: Number(store.cls.toFixed(4)),
      ttfb: Math.round(navigation.responseStart - navigation.requestStart),
      transferred:
        navigation.transferSize +
        appResources.reduce((total, resource) => total + resource.transferSize, 0),
      scriptBytes: appResources
        .filter(
          (resource) => resource.initiatorType === "script" || /\.js(\?|$)/.test(resource.name),
        )
        .reduce((total, resource) => total + resource.transferSize, 0),
    };
  });
}

function report(name: string, vitals: Vitals) {
  const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
  console.log(
    `[perf] ${name.padEnd(24)} LCP ${String(vitals.lcp).padStart(5)}ms  ` +
      `CLS ${vitals.cls.toFixed(4)}  TTFB ${String(vitals.ttfb).padStart(4)}ms  ` +
      `transferred ${kb(vitals.transferred).padStart(9)}  js ${kb(vitals.scriptBytes).padStart(9)}`,
  );
}

/**
 * Cumulative Layout Shift, Google's "good" threshold.
 *
 * Asserted at the real number rather than a relaxed one, because layout shift
 * is caused by markup — an image without dimensions, a late-injected banner —
 * and a headless browser is as capable of exposing that as any other. This is
 * the assertion most likely to catch a genuine regression.
 */
const MAX_CLS = 0.1;

/**
 * Largest Contentful Paint ceiling, deliberately loose.
 *
 * Google's "good" bar is 2500ms on a real connection. Against a local server
 * anything near that means something is badly wrong — a blocking script, a
 * server-side fetch on the critical path — which is what this is for. It is a
 * tripwire, not a performance claim.
 */
const MAX_LCP_MS = 2500;

/**
 * The app's own JavaScript, per page.
 *
 * CodeMirror is most of it and is genuinely needed on a lesson page. The budget
 * exists so that adding a heavy dependency is a decision someone makes on
 * purpose rather than something that happens quietly.
 */
const MAX_SCRIPT_BYTES = 700 * 1024;

test.describe("performance", () => {
  const pages = [
    { name: "landing", path: "/" },
    { name: "curriculum", path: "/learn" },
    { name: "module", path: "/learn/orientation" },
    { name: "lesson", path: "/learn/orientation/what-a-program-is" },
  ];

  for (const { name, path } of pages) {
    test(`${name} stays within its budget`, async ({ page }) => {
      const vitals = await measure(page, path);
      report(name, vitals);

      expect(vitals.cls, "cumulative layout shift").toBeLessThanOrEqual(MAX_CLS);
      expect(vitals.lcp, "largest contentful paint").toBeLessThanOrEqual(MAX_LCP_MS);
      expect(vitals.scriptBytes, "app JavaScript").toBeLessThanOrEqual(MAX_SCRIPT_BYTES);
    });
  }

  test("the interpreter is fetched on approach, not on arrival", async ({ page }) => {
    // The single most important performance property of the whole product, and
    // it has two halves that must both hold. Opening a lesson to read it must
    // not cost 14 MB — but the download must still start before the learner
    // reaches the exercise, or the warm-up is decorative and every first Run
    // pays the full cold start.
    //
    // Asserting only the first half would pass just as well if the warm-up were
    // silently broken, which is exactly the mistake this test exists to prevent.
    const interpreter: string[] = [];
    page.on("request", (request) => {
      if (/pyodide|python_stdlib|\/python\/worker\.js/.test(request.url())) {
        interpreter.push(request.url());
      }
    });

    await page.goto("/learn/orientation/what-a-program-is", { waitUntil: "networkidle" });
    expect(interpreter, "interpreter fetched before the learner scrolled to an exercise").toEqual(
      [],
    );

    const exercise = page.locator("#exercise-run-your-first-program");
    await exercise.scrollIntoViewIfNeeded();
    await expect
      .poll(() => interpreter.length, {
        message: "the warm-up never started after an exercise came into view",
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    // Finish the load in the same test rather than a separate one. Two tests
    // meant two 14 MB downloads, and the first left one in flight as its context
    // closed — which the second then contended with and lost. Measuring here
    // also gives the honest number: time from click to graded result, on an
    // interpreter that has had a moment to warm up, which is the learner's case.
    const started = Date.now();
    await exercise.getByRole("button", { name: "Run", exact: true }).click();
    await expect(exercise).toContainText("this exercise is done", { timeout: 90_000 });

    // Not asserted as a budget: it is dominated by a download whose speed is not
    // ours to control. Printed so the number is visible and a tenfold regression
    // would be noticed. See docs/performance.md for what it means.
    console.log(`[perf] warm start to graded result: ${Date.now() - started}ms`);
  });
});
