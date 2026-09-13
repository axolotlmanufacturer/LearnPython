/**
 * Response headers, asserted rather than assumed.
 *
 * These are the kind of configuration that is added once, never looked at
 * again, and silently lost in a refactor of `next.config.mjs` — with nothing
 * failing to indicate it. The rest of the end-to-end suite would stay green
 * with every one of them removed, which is precisely why they are checked here.
 *
 * The interesting one is the Content-Security-Policy. This application exists
 * to run code its users wrote, so the usual "never allow WebAssembly
 * compilation" advice does not apply — the questions worth asking are whether
 * that permission is the *narrow* one, and whether learner code can reach
 * anything. Both are asserted below.
 */
import { expect, test } from "@playwright/test";

test.describe("security headers", () => {
  test("every response carries the baseline headers", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["content-security-policy"]).toBeTruthy();
  });

  test("the policy permits WebAssembly but not string eval", async ({ page }) => {
    const response = await page.goto("/learn/orientation/what-a-program-is");
    const csp = response!.headers()["content-security-policy"];

    // `wasm-unsafe-eval` is what the interpreter needs. `unsafe-eval` would also
    // work and would additionally re-enable eval() on strings, which nothing
    // here wants — the distinction is the entire point of listing the narrow one.
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("learner code cannot reach a third party", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"] ?? "";

    // connect-src is the directive that actually contains a learner's program:
    // whatever it computes, it has nowhere to send it. Only this origin and,
    // when the interpreter is served from a CDN, that CDN.
    const connect = csp.split(";").find((directive) => directive.trim().startsWith("connect-src"));
    expect(connect).toBeTruthy();
    expect(connect).toContain("'self'");
    expect(connect).not.toContain("*");

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test("the interpreter's origin is allowed wherever it is served from", async ({ page }) => {
    // The policy is derived from PYODIDE_INDEX_URL rather than written by hand,
    // so it cannot drift from where the assets actually come from. This suite
    // self-hosts, so the expectation here is 'self' and nothing more; a CDN
    // deployment adds that origin to the same two directives.
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"];

    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("worker-src 'self'");
  });
});
