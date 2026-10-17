import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
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
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".xml": "application/xml",
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
  const sitemap = readFileSync("site/sitemap.xml", "utf8");
  assert(sitemap.includes("https://kasperrt.github.io/smolter/docs/fetchers/"));
  assert(
    !sitemap.includes("/react/") &&
      !sitemap.includes("/preact/") &&
      !sitemap.includes("/tasks"),
  );
  const landingHtml = readFileSync("site/index.html", "utf8");
  assert(
    landingHtml.includes("Data flow you can follow."),
    "Root document must contain prerendered content",
  );
  const entry = landingHtml.match(/<script[^>]+src="([^"]+\.js)"/)[1];
  const entryBytes = readFileSync(
    join("site", entry.replace(/^\/smolter\//, "")),
  );
  assert(
    gzipSync(entryBytes, { level: 9 }).length < 25_000,
    "Site initial JavaScript exceeded its 25 kB gzip budget",
  );
  assert(
    !existsSync("site/react/assets"),
    "Do not publish a second React runtime for the site",
  );

  for (const framework of ["preact"]) {
    const landing = await browser.newPage();
    let releaseEntry;
    const entryReady = new Promise((resolve) => {
      releaseEntry = resolve;
    });
    const landingScripts = [];
    landing.on("request", (request) => {
      if (request.resourceType() === "script")
        landingScripts.push(request.url());
    });
    await landing.route("**/assets/*.js", async (route) => {
      await entryReady;
      await route.continue();
    });
    await landing.route("**/*.ttf", (route) => route.abort());
    await landing.goto(`${origin}/smolter/`, {
      waitUntil: "commit",
    });
    await landing
      .getByRole("heading", { name: "Data flow you can follow.", exact: true })
      .waitFor();
    await landing.evaluate(() => {
      window.initialLanding = document.querySelector(".landing");
    });
    releaseEntry();
    await landing.waitForLoadState("networkidle");
    assert(
      await landing.evaluate(
        () => window.initialLanding === document.querySelector(".landing"),
      ),
      `${framework}: landing was replaced during hydration`,
    );
    assert(
      !landingScripts.some((url) => /_smolter-doc_|\/source-/.test(url)),
      `${framework}: unrelated content loaded on landing`,
    );
    await landing.close();

    const articleScripts = [];
    const hydrated = await browser.newPage();
    hydrated.on("request", (request) => {
      if (request.resourceType() === "script")
        articleScripts.push(request.url());
    });
    hydrated.setDefaultTimeout(10_000);
    console.log(`${framework}: checking pre-rendered documentation`);
    let allowScripts;
    const scriptsReady = new Promise((resolve) => {
      allowScripts = resolve;
    });

    await hydrated.route("**/assets/*.js", async (route) => {
      await scriptsReady;
      await route.continue();
    });
    hydrated.on("pageerror", (error) => errors.push(error.message));
    hydrated.on("console", (message) => {
      if (message.type() === "error")
        errors.push(`${message.text()} ${message.location().url}`);
    });
    await hydrated.goto(`${origin}/smolter/docs/fetchers/`, {
      waitUntil: "commit",
    });
    await hydrated
      .getByRole("heading", {
        name: "Independent reads and writes",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await hydrated.title(),
      "Independent reads and writes · smolter docs",
    );
    assert.equal(
      await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
      "https://kasperrt.github.io/smolter/docs/fetchers/",
    );
    assert(
      await hydrated
        .locator('meta[name="description"]')
        .getAttribute("content"),
    );
    assert.equal(
      await hydrated
        .locator('meta[property="og:title"]')
        .getAttribute("content"),
      await hydrated.title(),
    );
    assert.equal(
      await hydrated
        .locator('meta[name="twitter:card"]')
        .getAttribute("content"),
      "summary_large_image",
    );
    const schema = JSON.parse(
      await hydrated
        .locator('script[type="application/ld+json"]')
        .textContent(),
    );
    assert.equal(schema.codeRepository, "https://github.com/kasperrt/smolter");
    const icon = await hydrated
      .locator('link[rel="icon"]')
      .getAttribute("href");
    const iconResponse = await hydrated.request.get(
      new URL(icon, hydrated.url()).href,
    );
    assert(iconResponse.ok());
    assert((await iconResponse.text()).includes('<path fill="#572849"'));
    const image = await hydrated
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    assert((await hydrated.request.get(origin + new URL(image).pathname)).ok());
    await hydrated.evaluate(() => {
      window.initialArticle = document.querySelector(".docs-article");
    });
    allowScripts();
    await hydrated.waitForLoadState("networkidle");
    assert(
      await hydrated.evaluate(
        () => window.initialArticle === document.querySelector(".docs-article"),
      ),
      `${framework}: ${errors.join("\n")}`,
    );
    assert(
      !articleScripts.some((url) => /_smolter-doc_|\/source-/.test(url)),
      `${framework}: SSR article was downloaded twice`,
    );
    console.log(`${framework}: hydration retained the article`);
    await hydrated
      .getByRole("navigation", { name: "Documentation", exact: true })
      .getByRole("link", { name: "Actions", exact: true })
      .click();
    await hydrated
      .getByRole("heading", { name: "Actions", exact: true })
      .waitFor();
    assert.equal(
      articleScripts.filter((url) => url.includes("_smolter-doc_")).length,
      1,
      `${framework}: navigation should load only its article`,
    );
    assert(articleScripts.some((url) => url.includes("_smolter-doc_actions-")));
    assert.equal(
      await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
      "https://kasperrt.github.io/smolter/docs/actions/",
    );
    assert.equal(
      await hydrated
        .locator('meta[property="og:title"]')
        .getAttribute("content"),
      "Actions · smolter docs",
    );
    await hydrated.locator(".wordmark").click();
    await hydrated
      .getByRole("heading", { name: "Data flow you can follow.", exact: true })
      .waitFor();
    assert.equal(
      await hydrated.title(),
      "smolter · Typed routing for React and Preact",
    );
    assert.equal(
      await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
      "https://kasperrt.github.io/smolter/",
    );
    assert.equal(
      await hydrated.locator('meta[name="robots"]').getAttribute("content"),
      "index,follow",
    );
    await hydrated.close();
  }

  for (const legacy of ["react", "preact"]) {
    await page.goto(
      `${origin}/smolter/${legacy}/docs/fetchers/?from=old#reads`,
    );
    await page.waitForURL(`${origin}/smolter/docs/fetchers?from=old#reads`);
    await page
      .getByRole("heading", {
        name: "Independent reads and writes",
        exact: true,
      })
      .waitFor();
  }
  await page.goto(`${origin}/smolter/`);
  const sizes = JSON.parse(readFileSync("packages/ui/src/size.json", "utf8"));
  const entries = page.getByRole("table", {
    name: "Complete entries & optional features · gzip bytes",
  });
  const comparisons = page.getByRole("table", {
    name: "Same measurement tools · gzip bytes",
  });

  assert((await entries.innerText()).includes(String(sizes.preact)));
  assert(
    (await page.locator(".size-cards").innerText()).includes(
      String(sizes.preactRouting),
    ),
  );
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
  const tasksHref = await page
    .getByRole("link", {
      name: "Tasks: creation, updates, and fetcher reads →",
      exact: true,
    })
    .getAttribute("href");
  assert.equal(new URL(tasksHref, page.url()).href, `${origin}/smolter/tasks`);
  const documentPage = await browser.newPage();
  await documentPage.goto(new URL(tasksHref, page.url()).href);
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
  await page.getByRole("heading", { name: "Tasks", exact: true }).waitFor();

  assert.equal(page.url(), `${origin}/smolter/tasks`);
  const routeHref = await page
    .getByRole("link", { name: "Read the route", exact: true })
    .getAttribute("href");

  assert.ok(routeHref);
  assert.equal(
    new URL(routeHref, page.url()).href,
    `${origin}/smolter/tasks/1`,
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
  assert.equal(page.url(), `${origin}/smolter/tasks`);
  await page.getByRole("link", { name: "Docs", exact: true }).click();
  await page
    .getByRole("link", {
      name: "Search: GET forms and URL parameters →",
      exact: true,
    })
    .click();
  await page.getByLabel("Search query").fill("route");
  await page.getByRole("button", { name: "Search tasks", exact: true }).click();
  await page.waitForURL(`${origin}/smolter/tasks/search?q=route`);
  await page
    .getByRole("link", { name: "Read the route", exact: true })
    .waitFor();

  for (const framework of ["preact"]) {
    await page.goto(`${origin}/smolter/docs/useFetcher`);
    await page
      .getByRole("heading", { name: "useFetcher", exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "Documentation", exact: true })
      .getByRole("link", { name: "Routing", exact: true })
      .click();
    await page.waitForURL(`${origin}/smolter/docs/routing`);
    await page.reload();
    await page.getByRole("heading", { name: "Routing", exact: true }).waitFor();

    await page.goto(`${origin}/smolter/docs/bundle-size`);
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
      await page.goto(`${origin}/smolter/docs/${slug}`);
      await page.getByRole("heading", { name: slug, exact: true }).waitFor();
      await page.getByRole("heading", { name: section, exact: true }).waitFor();
    }
  }

  for (const slug of ["constructor", "__proto__", "missing-page"]) {
    await page.goto(`${origin}/smolter/docs/${slug}`);
    await page
      .getByText("Documentation page not found", { exact: true })
      .waitFor();
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute("content"),
      "noindex,follow",
    );
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
  "Pages: Preact SSR, split articles, legacy redirects, fetcher reads, and deep-link refresh passed",
);
