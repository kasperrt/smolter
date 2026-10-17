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
  const sizes = JSON.parse(readFileSync("packages/ui/src/size.json", "utf8"));
  const entries = page.getByRole("table", {
    name: "Entry points · gzip bytes",
  });
  const comparisons = page.getByRole("table", {
    name: "Same measurement tools · gzip bytes",
  });

  assert((await entries.innerText()).includes(String(sizes.preactRouting)));
  assert(
    (await comparisons.innerText()).includes(String(sizes.reactRouterData)),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1280, height: 900 });

  await page
    .getByRole("heading", { name: "Data flow you can follow.", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Get started →", exact: true }).click();
  assert.equal(
    await page
      .getByRole("link", {
        name: "Tasks: creation, updates, and fetcher reads →",
        exact: true,
      })
      .getAttribute("href"),
    "/smolter/react/tasks",
  );

  const documentPage = await browser.newPage();

  await documentPage.goto(
    `${origin}${await page.getByRole("link", { name: "Tasks: creation, updates, and fetcher reads →", exact: true }).getAttribute("href")}`,
  );
  await documentPage
    .getByRole("heading", { name: "Tasks", exact: true })
    .waitFor();
  await documentPage.close();

  await page
    .getByRole("link", {
      name: "Tasks: creation, updates, and fetcher reads →",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Fetch task 1" }).click();
  await page
    .locator(".panel-tabs")
    .getByRole("link", { name: "Preact", exact: true })
    .click();
  await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();

  assert.equal(page.url(), `${origin}/smolter/preact/tasks`);
  const routeHref = await page
    .getByRole("link", { name: "Read the route", exact: true })
    .getAttribute("href");

  assert.ok(routeHref);
  assert.equal(
    new URL(routeHref, page.url()).href,
    `${origin}/smolter/preact/tasks/1`,
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
  await page.getByRole("link", { name: "← All tasks", exact: true }).click();
  assert.equal(page.url(), `${origin}/smolter/preact/tasks`);
  await page.getByRole("link", { name: "Docs", exact: true }).click();
  await page
    .getByRole("link", {
      name: "Search: GET forms and URL parameters →",
      exact: true,
    })
    .click();
  await page.getByLabel("Search query").fill("route");
  await page.getByRole("button", { name: "Search tasks", exact: true }).click();
  await page.waitForURL(`${origin}/smolter/preact/tasks/search?q=route`);
  await page
    .getByRole("link", { name: "Read the route", exact: true })
    .waitFor();

  for (const framework of ["react", "preact"]) {
    await page.goto(`${origin}/smolter/${framework}/docs/useFetcher`);
    await page
      .getByRole("heading", { name: "useFetcher", exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "Documentation", exact: true })
      .getByRole("link", { name: "Routing", exact: true })
      .click();
    await page.waitForURL(`${origin}/smolter/${framework}/docs/routing`);
    await page.reload();
    await page.getByRole("heading", { name: "Routing", exact: true }).waitFor();

    await page.goto(`${origin}/smolter/${framework}/docs/bundle-size`);
    await page
      .getByRole("heading", {
        name: "Bundle size and tree shaking",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("heading", { name: "Routing only", exact: true })
      .waitFor();
    assert.match(
      await page.locator(".docs-article").innerText(),
      /Preact routing only: \d+ B gzip/,
    );

    for (const [slug, section] of [
      ["Await", "Pending and resolved values"],
      ["useNavigation", "Retained views"],
      ["RootModule", "Contract"],
      ["ScrollRestoration", "Restoration order"],
    ]) {
      await page.goto(`${origin}/smolter/${framework}/docs/${slug}`);
      await page.getByRole("heading", { name: slug, exact: true }).waitFor();
      await page.getByRole("heading", { name: section, exact: true }).waitFor();
    }
  }

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
  "Pages: framework switching, fetcher reads, documentation, and deep-link refresh passed",
);
