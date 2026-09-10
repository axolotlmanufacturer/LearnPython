/**
 * The MVP loop, end to end (brief §10 and §11): sign up → open Module 0 →
 * complete an exercise → see progress update, and confirm progress persists
 * across sessions.
 *
 * This is the only test in the suite that exercises the *real* Web Worker
 * running the *real* WebAssembly interpreter in a *real* browser. Everything
 * else stubs one of those three, so if in-browser execution were broken in a
 * way only a browser exposes — worker bundling, asset paths, module loading —
 * this is what would catch it.
 */
import { expect, test } from "@playwright/test";

/** A fresh address per run, so a re-run does not collide with an existing account. */
function newLearner() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  return {
    email: `learner-${unique}@example.com`,
    password: "a-sufficiently-long-password",
    displayName: "Test Learner",
  };
}

test.describe("the learner journey", () => {
  test("sign up, run code, complete an exercise, and keep the progress", async ({ page }) => {
    const learner = newLearner();

    await test.step("sign up", async () => {
      await page.goto("/sign-up");
      await page.getByLabel("What should we call you?").fill(learner.displayName);
      await page.getByLabel("Email address").fill(learner.email);
      await page.getByLabel("Password", { exact: true }).fill(learner.password);
      await page.getByRole("button", { name: "Create account" }).click();

      await expect(page).toHaveURL(/\/learn$/);
      await expect(page.getByTestId("signed-in-as")).toHaveText(learner.displayName);
    });

    await test.step("navigate to the first lesson of Module 0", async () => {
      await page.getByRole("link", { name: /Orientation/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Orientation");

      await page.getByRole("link", { name: /What a program is/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("What a program is");
    });

    await test.step("run the worked example in a real interpreter", async () => {
      const example = page.locator("section", { hasText: "Worked example" }).first();
      await example.getByRole("button", { name: /Run this example/ }).click();

      // Assertions are scoped to the output pane: the lesson prose legitimately
      // contains the same words the program prints.
      const output = example.getByTestId("output");
      // The first run downloads and starts Python, which is genuinely slow.
      await expect(output).toContainText("Good morning", { timeout: 90_000 });
      await expect(output).toContainText("The kettle is on");
    });

    await test.step("complete the first exercise", async () => {
      const exercise = page.locator("#exercise-run-your-first-program");
      await expect(exercise).toContainText("Predict the output");
      await expect(page.getByTestId("lesson-progress")).toHaveText("0 of 2 exercises done");

      await exercise.getByRole("button", { name: "Run", exact: true }).click();

      await expect(exercise).toContainText("this exercise is done");
      await expect(page.getByTestId("lesson-progress")).toHaveText("1 of 2 exercises done");
    });

    await test.step("get real feedback on a wrong answer", async () => {
      const exercise = page.locator("#exercise-change-the-order");
      await exercise.getByRole("button", { name: "Run", exact: true }).click();

      // The starter code is deliberately in the wrong order.
      await expect(exercise).toContainText(/0 of 1 checks pass/);
      await expect(page.getByTestId("lesson-progress")).toHaveText("1 of 2 exercises done");
    });

    await test.step("fix it and finish the lesson", async () => {
      const exercise = page.locator("#exercise-change-the-order");
      const editor = exercise.locator(".cm-content");

      await editor.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type('print("First.")\nprint("Second.")\nprint("Third.")');

      await exercise.getByRole("button", { name: "Run", exact: true }).click();

      await expect(exercise).toContainText("this exercise is done");
      await expect(page.getByTestId("lesson-progress")).toHaveText("2 of 2 exercises done");
      await expect(page.getByTestId("lesson-complete")).toContainText("Your progress is saved");
    });

    await test.step("progress survives signing out and back in", async () => {
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();

      await page.goto("/sign-in");
      await page.getByLabel("Email address").fill(learner.email);
      await page.getByLabel("Password", { exact: true }).fill(learner.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/learn$/);

      const progress = await page.evaluate(async () => {
        const response = await fetch("/api/progress", { credentials: "include" });
        return (await response.json()) as Array<{ lesson_slug: string; status: string }>;
      });

      expect(progress).toContainEqual(
        expect.objectContaining({ lesson_slug: "what-a-program-is", status: "completed" }),
      );
    });
  });

  test("explains an error in plain language and still shows the traceback", async ({ page }) => {
    // Section 2, principle 3 — the single highest-leverage feature for a novice.
    await page.goto("/learn/orientation/when-things-go-wrong");

    const exercise = page.locator("#exercise-find-the-line");
    await exercise.getByRole("button", { name: "Run", exact: true }).click();

    // Assert the contract rather than a particular sentence: an explanation in
    // prose, a concrete next step, and the line to look at — which is the whole
    // point of this lesson. The exact wording comes from errorMapping.ts and is
    // pinned by its own unit tests.
    const feedback = exercise.getByTestId("feedback");
    await expect(feedback).toContainText("Try this:", { timeout: 90_000 });
    await expect(feedback).toContainText("line 3");
    await expect(feedback.getByRole("heading")).not.toContainText("SyntaxError");

    // The real traceback is available underneath, not hidden away.
    await exercise.getByRole("button", { name: /what Python actually said/ }).click();
    await expect(exercise.locator("pre").filter({ hasText: "SyntaxError" })).toBeVisible();
  });

  test("stops a program that never ends, and stays usable afterwards", async ({ page }) => {
    // A beginner's first `while` loop very often never ends; the platform has to
    // survive that without the learner reloading the page.
    await page.goto("/learn/values/values-and-variables");

    const example = page.locator("section", { hasText: "Worked example" }).first();
    const editor = example.locator(".cm-content");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("while True:\n    pass");

    await example.getByRole("button", { name: /Run this example/ }).click();

    await expect(example.getByTestId("feedback")).toContainText(/still running/i, {
      timeout: 90_000,
    });

    // And the runtime comes back on its own, without a reload.
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type('print("still alive")');
    await example.getByRole("button", { name: /Run this example/ }).click();

    await expect(example.getByTestId("output")).toContainText("still alive", { timeout: 90_000 });
  });
});
