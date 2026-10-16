import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const examples = [
  { name: "react-ssr", port: 4375 },
  { name: "preact-ssr", port: 4376 },
];
const servers = examples.map(({ name, port }) =>
  spawn(process.execPath, [`apps/${name}/server/start.mjs`], {
    env: { ...process.env, PORT: String(port) },
    stdio: "inherit",
  }),
);
let browser;

async function verify() {
  browser = await chromium.launch();

  for (const { name, port } of examples) {
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;

    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await fetch(origin).catch(() => null);

      if (response?.ok) {
        ready = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    assert.ok(ready, `${name} did not start`);

    const page = await browser.newPage();
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));

    const response = await page.goto(origin);

    assert.match(await response.text(), /data-testid="count">0/);

    await page.getByRole("button", { name: "Add one +", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="count"]')?.textContent === "1",
    );
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
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

    assert.deepEqual(errors, []);

    await page.close();

    console.log(
      `${name}: production SSR, hydration, fetcher read, POST and PATCH passed`,
    );
  }
}

await verify().finally(async () => {
  await browser?.close();

  for (const server of servers) server.kill("SIGTERM");
});
