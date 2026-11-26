import { spawn } from "node:child_process";
import { once } from "node:events";
import { safeWrapAsync } from "@smolter/core";
import { expect } from "vitest";
import { test } from "../tests/helpers/browser.ts";

const examples = [
  { name: "react-ssr", port: 4375 },
  { name: "preact-ssr", port: 4376 },
];
for (const { name, port } of examples) {
  test(`${name} supports production hydration, fetchers and mutations`, async ({
    page,
    onTestFinished,
  }) => {
    const server = spawn(process.execPath, [`apps/${name}/server/start.ts`], {
      env: { ...process.env, PORT: String(port) },
      stdio: "inherit",
    });
    onTestFinished(async () => {
      if (server.exitCode !== null || server.signalCode !== null) return;
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    });
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const { data: response } = await safeWrapAsync(() => fetch(origin));
      if (response?.ok) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(ready, `${name} did not start`).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(`${origin}/examples/counter`);
    expect(await response?.headerValue("cache-control")).toBe(
      "private, no-store",
    );
    expect(await response?.text()).toMatch(/data-testid="count">0/);
    await page.getByRole("button", { name: "Add one +", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="count"]')?.textContent === "1",
    );
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await page
      .getByRole("link", {
        name: "Fetchers →",
        exact: true,
      })
      .click();
    await page.waitForURL("**/docs/fetchers");
    await page.goto(`${origin}/tasks`);
    await page.getByRole("button", { name: "Fetch task 1" }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="fetcher-data"]')?.textContent ===
        "Read the route",
    );
    await page
      .getByRole("link", { name: "Read the route", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Production action");
    await page.getByRole("button", { name: "Save task" }).click();
    await page.getByText("Task saved.", { exact: true }).waitFor();
    const hydrationRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith(".__smolter"))
        hydrationRequests.push(request.url());
    });
    const failed = await page.goto(`${origin}/tasks/missing`);
    expect(await failed?.headerValue("cache-control")).toBe(
      "private, no-store",
    );
    expect(await failed?.text()).toMatch(/Task not found/);
    await page.waitForFunction(() => !document.getElementById("root")?.inert);
    await page
      .getByRole("alert")
      .filter({ hasText: "Task not found" })
      .waitFor();
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await page.waitForURL("**/docs/getting-started");
    expect(
      hydrationRequests.filter((url) => url.includes("missing")).length,
    ).toBe(0);
    expect(errors).toStrictEqual([]);
  });
}
