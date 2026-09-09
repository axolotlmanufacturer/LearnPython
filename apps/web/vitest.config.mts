import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Booting Pyodide costs ~2 s, and the content tests boot it once and then run
    // every authored exercise's reference solution through it.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    pool: "forks",
  },
});
