import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Both servers are started here so the suite is one command locally and in CI.
 * The API is given the test database and the curriculum is loaded into it first,
 * because the flow under test — sign up, open Module 0, solve an exercise, see
 * progress — is meaningless against an empty curriculum.
 */

const API_PORT = 8001;
const WEB_PORT = 3100;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/learnpython_e2e";

const apiDir = "../api";
const python = process.env.CI ? "python" : "./.venv/bin/python";

export default defineConfig({
  testDir: "./e2e",
  // Booting Pyodide in a real browser is genuinely slow the first time.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Some environments (including CI images that pre-install browsers)
        // ship a Chromium build that does not match the one this Playwright
        // version would download. Point at it explicitly when it is there,
        // rather than re-downloading ~150 MB on every run.
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: [
    {
      command: `${python} -m alembic upgrade head && ${python} -m app.content.load && ${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: apiDir,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { DATABASE_URL, ENVIRONMENT: "test" },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm run build && npx next start -p ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        API_ORIGIN: `http://127.0.0.1:${API_PORT}`,
        // Self-host the interpreter for the suite. Production fetches it from a
        // CDN, but CI must not depend on a third party being up to decide
        // whether the build is green — and the code path under test (worker,
        // asset resolution, grading) is identical either way.
        PYODIDE_INDEX_URL: "/pyodide/",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
