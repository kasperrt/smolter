import { defineConfig } from "@playwright/test";

// Standalone renderer diagnosis; the Smolter ownership release gate is owned-deferred.spec.ts.
export default defineConfig({
  testDir: ".",
  testMatch: "native-ownership.spec.ts",
});
