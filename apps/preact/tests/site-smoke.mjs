import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, expect } from "@playwright/test";
import { safeWrapAsync } from "@smolter/core";

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
page.setDefaultTimeout(10_000);
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));

const result = await safeWrapAsync(async () => {
  const sitemap = readFileSync("site/sitemap.xml", "utf8");
  assert(sitemap.includes("https://kasperrt.github.io/smolter/docs/fetchers/"));
  assert(
    !sitemap.includes("/react/") &&
      !sitemap.includes("/preact/") &&
      !sitemap.includes("/tasks"),
  );
  assert(
    !sitemap.includes("migration-0.3"),
    "Removed migration guide remains discoverable",
  );
  assert(!existsSync("site/docs/migration-0.3/index.html"));
  const awaitHtml = readFileSync("site/docs/Await/index.html", "utf8");
  assert(awaitHtml.includes("React 19+ provides use(promise)"));
  assert(awaitHtml.includes("https://react.dev/reference/react/use"));
  const gettingStartedHtml = readFileSync(
    "site/docs/getting-started/index.html",
    "utf8",
  );
  assert(
    !/href="(?:\/smolter)?\/(?:tasks|counter|examples\/counter)(?:[/?#"])/.test(
      gettingStartedHtml,
    ),
    "Guide must not link to retired demos",
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
    gzipSync(entryBytes, { level: 9 }).length < 28_000,
    "Site initial JavaScript exceeded its 28 kB gzip budget",
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
    assert.equal(await hydrated.locator(".docs-support > div").count(), 4);
    const documentSupport = hydrated.locator(
      '.docs-sidebar a[href$="/docs/Document"] .docs-support-mini',
    );
    assert.equal(
      await documentSupport.locator(".support-alternative").count(),
      0,
    );
    assert.equal(await documentSupport.locator(".support-yes").count(), 4);
    const actionsLink = hydrated
      .getByRole("navigation", { name: "Documentation", exact: true })
      .getByRole("link", { name: "Actions", exact: true });
    const prefetched = hydrated.waitForResponse((response) =>
      response.url().includes("_smolter-doc_actions-"),
    );
    await actionsLink.hover();
    await prefetched;
    assert.equal(hydrated.url(), `${origin}/smolter/docs/fetchers/`);
    await actionsLink.focus();
    await actionsLink.click();
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
    // A cold article must not replace the shared shell with a loading panel.
    let releaseArticle;
    const articleReady = new Promise((resolve) => {
      releaseArticle = resolve;
    });
    let articleRequested;
    const requested = new Promise((resolve) => {
      articleRequested = resolve;
    });
    await hydrated.route("**/*_smolter-doc_loaders-*.js", async (route) => {
      articleRequested();
      await articleReady;
      await route.continue();
    });
    await hydrated.evaluate(() => {
      window.docsHeader = document.querySelector("header");
      window.docsSidebar = document.querySelector(".docs-sidebar");
      window.docsArticle = document.querySelector(".docs-article");
      window.docsDocument = document.documentElement;
      document.querySelector('.docs-sidebar a[href$="/docs/loaders"]').click();
    });
    await requested;
    assert(
      await hydrated.evaluate(
        () =>
          window.docsHeader === document.querySelector("header") &&
          window.docsSidebar === document.querySelector(".docs-sidebar") &&
          window.docsArticle === document.querySelector(".docs-article") &&
          document.querySelector(".docs-article h1").textContent === "Actions",
      ),
      "Pending article replaced the guide shell",
    );
    releaseArticle();
    await hydrated
      .getByRole("heading", { name: "Loaders", exact: true })
      .waitFor();
    assert(
      await hydrated.evaluate(
        () =>
          window.docsDocument === document.documentElement &&
          window.docsHeader === document.querySelector("header") &&
          window.docsSidebar === document.querySelector(".docs-sidebar") &&
          window.docsArticle === document.querySelector(".docs-article"),
      ),
      "Article navigation remounted the shared layout",
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
  const combinations = JSON.parse(
    readFileSync("packages/ui/src/size-combinations.json", "utf8"),
  );
  const selector = page.getByRole("region", { name: "Build your bundle" });
  const total = selector.locator("output strong");
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  const serverPages = selector.getByRole("checkbox", {
    name: "Server-rendered pages",
  });
  await serverPages.check();
  await page.clock.runFor(120);
  const rising = Number((await total.innerText()).replaceAll(",", ""));
  assert(
    rising > combinations.preact[5][1] && rising < combinations.preact[7][1],
    "Total must count upward through intermediate values",
  );
  assert.equal(
    await selector.locator(".size-announcement").innerText(),
    `${combinations.preact[7][1].toLocaleString("en-US")} bytes gzip`,
  );
  await serverPages.uncheck();
  await page.clock.runFor(120);
  const falling = Number((await total.innerText()).replaceAll(",", ""));
  assert(
    falling < rising && falling > combinations.preact[5][1],
    "Rapid changes must retarget downward from the displayed value",
  );
  await page.clock.runFor(400);
  assert.equal(
    await total.innerText(),
    combinations.preact[5][1].toLocaleString("en-US"),
  );
  await page.clock.resume();
  await expect(total).toHaveText(
    combinations.preact[5][1].toLocaleString("en-US"),
  );
  assert(
    await selector
      .getByRole("checkbox", { name: "Paths, links & history" })
      .isDisabled(),
  );
  await selector
    .getByRole("checkbox", { name: "Prefetch on intent" })
    .uncheck();
  await selector
    .getByRole("checkbox", { name: "Load and save data" })
    .uncheck();
  await expect(total).toHaveText(
    combinations.preact[0][1].toLocaleString("en-US"),
  );
  await selector
    .getByRole("checkbox", { name: "Server-rendered pages" })
    .check();
  assert(
    await selector
      .getByRole("checkbox", { name: "Load and save data" })
      .isDisabled(),
  );
  assert(
    await selector
      .getByRole("checkbox", { name: "Load and save data" })
      .isChecked(),
  );
  await expect(total).toHaveText(
    combinations.preact[3][1].toLocaleString("en-US"),
  );
  await selector.getByRole("radio", { name: "React", exact: true }).check();
  await expect(total).toHaveText(
    combinations.react[3][1].toLocaleString("en-US"),
  );
  const reactChoice = selector.getByRole("radio", {
    name: "React",
    exact: true,
  });
  await reactChoice.focus();
  await page.keyboard.press("ArrowLeft");
  assert(
    await selector
      .getByRole("radio", { name: "Preact", exact: true })
      .isChecked(),
  );
  await expect(total).toHaveText(
    combinations.preact[3][1].toLocaleString("en-US"),
  );
  await page.keyboard.press("ArrowRight");
  assert(await reactChoice.isChecked());
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await reactChoice.evaluate(
      (input) => getComputedStyle(input.parentElement).transitionDuration,
    ),
    "0s",
  );
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await selector.getByRole("radio", { name: "Preact", exact: true }).check();
  await page.clock.runFor(80);
  assert.equal(
    await total.innerText(),
    combinations.preact[3][1].toLocaleString("en-US"),
  );
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log(
    "Pages: selector keyboard, reduced motion, dependencies and measured totals passed",
  );
  const comparisons = page.getByRole("table", {
    name: "Same measurement tools · gzip bytes",
  });
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
  let releaseGuide;
  const guideReady = new Promise((resolve) => {
    releaseGuide = resolve;
  });
  const guideRequested = page.waitForRequest(
    "**/*_smolter-doc_getting-started-*.js",
  );
  await page.route("**/*_smolter-doc_getting-started-*.js", async (route) => {
    await guideReady;
    await route.continue();
  });
  await page.evaluate(() => {
    window.landingBeforeGuide = document.querySelector(".landing");
    window.headerBeforeGuide = document.querySelector("header");
    document.querySelector('header a[href$="/docs/getting-started"]').click();
  });
  console.log("Pages: waiting for cold guide request");
  await guideRequested;
  assert(
    await page.evaluate(
      () =>
        window.landingBeforeGuide === document.querySelector(".landing") &&
        window.headerBeforeGuide === document.querySelector("header"),
    ),
    "Opening docs replaced usable content with a loading panel",
  );
  assert.equal(
    await page.getByText("Loading documentation…", { exact: true }).count(),
    0,
  );
  releaseGuide();
  await page
    .getByRole("heading", { name: "Getting started", exact: true })
    .waitFor();
  await page.goto(`${origin}/smolter/?__route=/tasks/2`);
  await page
    .getByRole("heading", { name: "Data flow you can follow.", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/smolter/");
  for (const prefix of ["", "react/", "preact/"]) {
    for (const retired of [
      "tasks",
      "tasks/1",
      "tasks/search",
      "counter",
      "examples/counter",
      "search",
    ]) {
      const path = `${prefix}${retired}`;
      assert(!existsSync(`site/${path}/index.html`));
      const response = await page.goto(`${origin}/smolter/${path}`);
      assert.equal(response.status(), 404);
      await page
        .getByRole("heading", { name: "Page not found", exact: true })
        .waitFor();
      assert.equal(page.url(), `${origin}/smolter/${path}`);
      assert.equal(
        await page.locator('meta[name="robots"]').getAttribute("content"),
        "noindex,follow",
      );
    }
  }
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
});

await browser.close();
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

console.log(
  "Pages: Preact SSR, split articles, legacy documentation redirects, retired demo 404s, and deep-link refresh passed",
);
