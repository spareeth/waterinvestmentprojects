import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Use the "@/*" path alias from tsconfig.json.
    tsconfigPaths: true,
    alias: {
      // "server-only" throws outside a React Server environment; stub it for unit tests.
      "server-only": fileURLToPath(
        new URL("./tests/unit/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        // Real PostgreSQL (DATABASE_URL, migrations applied). Files run one at a time against the shared database.
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
