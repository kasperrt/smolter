import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: process.env.CI ? 2 : undefined,
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/browser/**"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: [
        "packages/{core,react,preact,client,server,files,vite}/src/**/*.{ts,tsx}",
      ],
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      thresholds: { lines: 100, perFile: true },
    },
  },
});
