/**
 * The accessibility audit (Section 8, and the MVP acceptance criterion in §11).
 *
 * Section 11 asks for accessibility to be *documented*, not merely intended. So
 * this runs in CI rather than being a one-off report someone ran once: a page
 * that regresses to a 3:1 contrast ratio or loses a form label fails the build,
 * which is the only version of "documented" that stays true.
 *
 * What this can and cannot tell you
 * ---------------------------------
 * Automated rules catch perhaps a third to a half of real WCAG failures. They
 * are very good at the mechanical ones — contrast, missing names, broken ARIA,
 * heading order — and blind to whether the reading order makes sense or the
 * error message is comprehensible. So the sweep below is paired with explicit
 * keyboard tests for the two interactions a learner cannot avoid: running code
 * and answering a review question. Those are the paths where a keyboard trap or
 * an unannounced result would actually stop someone.
 *
 * Findings are recorded in docs/accessibility.md.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * WCAG 2.1 Level AA, which is what Section 8 commits to.
 *
 * `best-practice` is deliberately excluded: it mixes genuine advice with
 * opinions that are not conformance requirements, and a suite that fails on
 * opinion trains people to ignore it.
 */
const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
}

/** Readable failure output: axe's raw JSON is unusable in a CI log. */
function describe(violations: Awaited<ReturnType<typeof scan>>["violations"]) {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `    ${node.target.join(" ")}`).join("\n"),
    )
    .join("\n\n");
}

function newLearner() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  return { email: `a11y-${unique}@example.com`, password: "a-sufficiently-long-password" };
}

async function signUp(page: Page) {
  const learner = newLearner();
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill(learner.email);
  await page.getByLabel("Password", { exact: true }).fill(learner.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/learn$/);
}

test.describe("accessibility", () => {
  // One case per distinct page *type*, not per URL: pages built from the same
  // components fail in the same ways, and a suite that scans all nineteen
  // lessons is slow without being more informative.
  const pages = [
    { name: "landing", path: "/" },
    { name: "sign in", path: "/sign-in" },
    { name: "sign up", path: "/sign-up" },
    { name: "curriculum", path: "/learn" },
    { name: "module", path: "/learn/orientation" },
    { name: "lesson with exercises", path: "/learn/orientation/what-a-program-is" },
    // A Track B lesson renders tables in its prose, which no Track A page does —
    // and a table is one of the shapes automated rules are actually good at
    // catching (missing headers, cells with no scope).
    { name: "statistics lesson", path: "/learn/describing-data/summarising-with-pandas" },
  ];

  for (const { name, path } of pages) {
    test(`${name} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(describe(results.violations)).toBe("");
    });
  }

  test("the review queue has no WCAG 2.1 AA violations", async ({ page }) => {
    await signUp(page);
    await page.goto("/review");
    const results = await scan(page);
    expect(describe(results.violations)).toBe("");
  });

  test("an exercise stays conformant once it has feedback on screen", async ({ page }) => {
    // The states worth scanning are the ones a static crawl never reaches. A
    // failure callout that renders red text on a red wash passes an audit of the
    // empty page and fails the learner who actually got something wrong.
    await page.goto("/learn/orientation/what-a-program-is");
    const exercise = page.locator("#exercise-change-the-order");
    await exercise.getByRole("button", { name: "Run", exact: true }).click();
    await expect(exercise.getByTestId("feedback")).toBeVisible({ timeout: 90_000 });

    const results = await scan(page);
    expect(describe(results.violations)).toBe("");
  });

  test("a review question stays conformant once answered", async ({ page }) => {
    await signUp(page);

    const lessons = await page.evaluate(async () => {
      const response = await fetch("/api/curriculum/modules/orientation", {
        credentials: "include",
      });
      const body = (await response.json()) as { lessons: Array<{ slug: string }> };
      return body.lessons.map((lesson) => lesson.slug);
    });
    for (const lesson of lessons) {
      await page.evaluate(
        async (slug) =>
          void (await fetch(`/api/progress/lessons/orientation/${slug}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
          })),
        lesson,
      );
    }

    await page.goto("/review");
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Check answer" }).click();
    await expect(page.getByTestId("review-verdict")).toBeVisible();

    const results = await scan(page);
    expect(describe(results.violations)).toBe("");
  });

  test("a lesson is operable by keyboard alone", async ({ page }) => {
    // Running code is the one thing nobody can skip, so it must be reachable
    // without a pointer. Tab until the Run button has focus rather than asserting
    // a fixed number of stops, which any layout change would break.
    //
    // Escape is pressed whenever focus is inside an editor, because Tab there
    // indents rather than moving on. That is not the test working around the
    // product: it is the documented escape method (announced by the editor's
    // description), and a keyboard user following it must arrive at Run.
    await page.goto("/learn/orientation/what-a-program-is");

    const run = page.locator("#exercise-run-your-first-program").getByRole("button", {
      name: "Run",
      exact: true,
    });

    let reached = false;
    for (let stop = 0; stop < 60 && !reached; stop += 1) {
      const inEditor = await page.evaluate(
        () => document.activeElement?.classList.contains("cm-content") ?? false,
      );
      if (inEditor) await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      reached = await run.evaluate((element) => element === document.activeElement);
    }
    expect(reached, "the Run button was not reachable by keyboard").toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.locator("#exercise-run-your-first-program")).toContainText(
      "this exercise is done",
      { timeout: 90_000 },
    );
  });

  test("the editor announces itself and how to leave it", async ({ page }) => {
    // The regression this pins: `@uiw/react-codemirror` forwards `aria-label` to
    // the wrapper div, not to the element with role="textbox", so the obvious
    // way to label the editor silently labels nothing. See CodeEditor.tsx.
    await page.goto("/learn/orientation/what-a-program-is");

    const content = page.locator("#exercise-change-the-order .cm-content");
    await expect(content).toHaveAttribute("role", "textbox");
    await expect(content).toHaveAttribute("aria-label", /.+/);

    const describedBy = await content.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText(/Escape and then Tab/i);
  });

  test("the code editor can be escaped by keyboard", async ({ page }) => {
    // CodeMirror captures Tab to indent, which is right for writing code and a
    // keyboard trap if that is the only behaviour: WCAG 2.1.2 requires a way out.
    // CodeMirror's own answer is Escape-then-Tab, and this pins that it works —
    // a learner who tabs into the editor must be able to tab out again.
    await page.goto("/learn/orientation/what-a-program-is");

    const editor = page.locator("#exercise-change-the-order .cm-content");
    await editor.click();
    await expect(editor).toBeFocused();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");

    await expect(editor).not.toBeFocused();
  });

  test("every page has one h1 and a skip link that works", async ({ page }) => {
    for (const { path } of pages) {
      await page.goto(path);

      // Exactly one h1: screen-reader users navigate by heading, and two
      // top-level headings on a page make "what is this page" ambiguous.
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      // The skip link is the first thing keyboard focus reaches, and it must
      // actually move focus rather than only change the URL fragment.
      await page.keyboard.press("Tab");
      const skip = page.getByRole("link", { name: /skip to (main )?content/i });
      await expect(skip).toBeFocused();
    }
  });
});
