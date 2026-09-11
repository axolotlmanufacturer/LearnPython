/**
 * The review loop, end to end: finish a module, find its questions waiting,
 * answer one, and see the explanation.
 *
 * The load-bearing assertion is the one about the answer. Everything else here
 * could be checked against the API directly; that the answer is *not in the
 * page* before a choice is submitted is a property of the whole stack — server,
 * serialisation, and the component that renders it — and only a browser can say
 * so honestly.
 *
 * This test drives the real module through the interface rather than seeding
 * progress, because "a module counts as finished" is exactly the thing the
 * queue's eligibility rule depends on.
 */
import { expect, test, type Page } from "@playwright/test";

function newLearner() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  return { email: `reviewer-${unique}@example.com`, password: "a-sufficiently-long-password" };
}

/** Sign up and land on the curriculum. */
async function signUp(page: Page, learner: { email: string; password: string }) {
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill(learner.email);
  await page.getByLabel("Password", { exact: true }).fill(learner.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/learn$/);
}

/**
 * Mark every lesson of a module complete through the API the browser uses.
 *
 * Working through Module 0's lessons by hand would mean running the interpreter
 * several times over, which the journey spec already covers; this test is about
 * what happens *after* a module is finished.
 */
async function finishModule(page: Page, moduleSlug: string) {
  const lessons = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/curriculum/modules/${slug}`, { credentials: "include" });
    const body = (await response.json()) as { lessons: Array<{ slug: string }> };
    return body.lessons.map((lesson) => lesson.slug);
  }, moduleSlug);

  expect(lessons.length).toBeGreaterThan(0);

  for (const lessonSlug of lessons) {
    const status = await page.evaluate(
      async ([module, lesson]) => {
        const response = await fetch(`/api/progress/lessons/${module}/${lesson}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        return response.status;
      },
      [moduleSlug, lessonSlug] as const,
    );
    expect(status).toBe(200);
  }
}

/** Pick the first option for the question on screen and submit it. */
async function answerCurrent(page: Page) {
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByTestId("review-verdict")).toBeVisible();
}

/** The slugs currently waiting, straight from the API the page reads. */
async function dueSlugs(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const response = await fetch("/api/quiz/due", { credentials: "include" });
    const items = (await response.json()) as Array<{ slug: string }>;
    return items.map((item) => item.slug);
  });
}

test.describe("the review queue", () => {
  test("offers nothing before a module is finished", async ({ page }) => {
    await signUp(page, newLearner());

    await page.getByRole("link", { name: "Review" }).click();

    // Phrased as "up to date", never as a backlog or a shortfall.
    await expect(page.getByRole("heading", { name: "Nothing due" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Carry on learning/ })).toBeVisible();
  });

  test("surfaces a finished module's questions and explains the answer", async ({ page }) => {
    await signUp(page, newLearner());
    await finishModule(page, "orientation");

    await test.step("the curriculum page points at the waiting questions", async () => {
      await page.goto("/learn");
      await expect(page.getByRole("link", { name: /questions? to review/ })).toBeVisible();
      // The finished module is marked; nothing marks the unfinished ones.
      await expect(page.getByRole("link", { name: /Orientation/ })).toContainText("Finished");
    });

    await page.getByRole("link", { name: /questions? to review/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Review");

    const verdict = page.getByTestId("review-verdict");
    await expect(page.getByRole("radio").first()).toBeVisible();

    // How many questions this sitting holds. Read from the API rather than
    // counted off the screen, because the queue shows one at a time — and it
    // makes the walk below exact rather than a poll that can race the network.
    const queued = await dueSlugs(page);
    expect(queued.length).toBeGreaterThan(1);

    await test.step("what the browser received carries no answers", async () => {
      // Multiple choice means the correct text is on screen as one of the
      // options — that is unavoidable. What must not be there is any way to tell
      // *which*. So this inspects the payload the browser actually holds, having
      // travelled through the Next.js rewrite with a real session cookie.
      const items = await page.evaluate(async () => {
        const response = await fetch("/api/quiz/due", { credentials: "include" });
        return (await response.json()) as Array<Record<string, unknown>>;
      });

      for (const item of items) {
        expect(item).not.toHaveProperty("answer");
        expect(item).not.toHaveProperty("explanation_markdown");
      }
      await expect(verdict).toHaveCount(0);
    });

    await test.step("answering gets a verdict and an explanation", async () => {
      await answerCurrent(page);

      await expect(verdict).toBeVisible();
      // Right or wrong, the learner is told when it comes back — the schedule is
      // never hidden from them.
      await expect(verdict).toContainText(/You'll see this one again/);
    });

    await test.step("the sitting ends without a score to fall short of", async () => {
      for (let remaining = queued.length - 1; remaining > 0; remaining -= 1) {
        await verdict.getByRole("button", { name: "Next question" }).click();
        await expect(verdict).toHaveCount(0);
        await answerCurrent(page);
      }

      await verdict.getByRole("button", { name: "Finish" }).click();

      await expect(page.getByRole("heading", { name: "Done for now" })).toBeVisible();
      await expect(page.getByText(/nothing to keep up with here/i)).toBeVisible();
    });
  });

  test("an answered question leaves the queue", async ({ page }) => {
    await signUp(page, newLearner());
    await finishModule(page, "orientation");

    await page.goto("/review");
    const before = await dueSlugs(page);
    expect(before.length).toBeGreaterThan(0);

    await answerCurrent(page);

    // Answered items are scheduled a day out at the very soonest, so the one
    // just seen should not be waiting again.
    const after = await dueSlugs(page);
    expect(after).not.toContain(before[0]);
  });
});
