import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const path = join(
    process.cwd(),
    "site",
    pathname.replace(/^\/smolter\//, ""),
  );
  const file =
    existsSync(path) && statSync(path).isDirectory()
      ? join(path, "index.html")
      : path;
  const missing = !existsSync(file);
  const target = missing ? "site/404.html" : file;
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".ttf": "font/ttf",
  };

  response.writeHead(missing ? 404 : 200, {
    "Content-Type": types[extname(target)] ?? "application/octet-stream",
  });
  response.end(readFileSync(target));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const result = await (async () => {
  await page.goto(`${origin}/smolter/react/`);
  assert.equal(
    await page
      .getByRole("link", { name: "Tasks", exact: true })
      .getAttribute("href"),
    "/smolter/react/tasks",
  );

  const native = await browser.newPage();

  await native.goto(
    `${origin}${await page.getByRole("link", { name: "Tasks", exact: true }).getAttribute("href")}`,
  );
  await native.getByRole("heading", { name: "Tasks", exact: true }).waitFor();
  await native.close();
  await page.getByRole("button", { name: "Add one +", exact: true }).click();
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Fetch task 1" }).click();
  await page
    .locator(".panel-tabs")
    .getByRole("link", { name: "Preact", exact: true })
    .click();
  await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();

  assert.equal(page.url(), `${origin}/smolter/preact/tasks`);
  assert.equal(
    await page
      .getByRole("link", { name: "Read the route", exact: true })
      .getAttribute("href"),
    "/smolter/preact/tasks/1",
  );

  await page.getByLabel("New task").fill("Check a deep link");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await page
    .getByRole("link", { name: "Check a deep link", exact: true })
    .click();

  const detail = page.url();

  await page.reload();
  await page.getByRole("heading", { name: "Edit task", exact: true }).waitFor();

  assert.equal(page.url(), detail);
  assert.deepEqual(errors, []);
})().then(
  () => ({ ok: true }),
  (error) => ({ error }),
);

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

console.log(
  "Pages: counter, framework switching, fetcher reads, and deep-link refresh passed",
);
