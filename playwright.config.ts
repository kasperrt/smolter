import { defineConfig } from "@playwright/test";

const port = Number(process.env.SMOLTER_TEST_PORT ?? 4173);

export default defineConfig({
  testDir: "tests/browser",
  use: { baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `SMOLTER_PORT=${port} node scripts/dev.mjs`,
    url: `http://127.0.0.1:${port + 3}`,
    reuseExistingServer: !process.env.CI,
  },
});
