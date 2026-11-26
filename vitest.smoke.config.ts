import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    attachmentsDir: "test-results/attachments",
    projects: [
      {
        test: {
          name: "integration",
          include: ["packages/integration-tests/tests/browser/*.spec.ts"],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "smoke",
          include: ["packages/integration-tests/smoke/*.test.ts"],
          testTimeout: 120_000,
        },
      },
      {
        test: {
          name: "diagnosis",
          include: [
            "packages/integration-tests/tests/reproductions/native-ownership.spec.ts",
          ],
          testTimeout: 30_000,
        },
      },
    ],
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
