import { chromium } from "@playwright/test";
import { test as base } from "vitest";

export const test = base
  .extend("browser", { scope: "file" }, async ({}, { onCleanup }) => {
    const browser = await chromium.launch();
    onCleanup(() => browser.close());
    return browser;
  })
  .extend("context", async ({ browser }, { onCleanup }) => {
    const context = await browser.newContext();
    onCleanup(() => context.close());
    return context;
  })
  .extend("page", async ({ context }) => context.newPage());
