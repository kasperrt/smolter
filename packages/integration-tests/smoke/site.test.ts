import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect } from "@playwright/test";
import { deferred } from "../../../tooling/test/deferred.ts";
import { test as browserTest } from "../tests/helpers/browser.ts";

declare global {
  interface Window {
    docsArticle?: Element | null;
    docsDocument?: Element | null;
    docsHeader?: Element | null;
    docsSidebar?: Element | null;
    headerBeforeGuide?: Element | null;
    initialArticle?: Element | null;
    initialLanding?: Element | null;
    landingBeforeGuide?: Element | null;
  }
}

const test = browserTest
  .extend("origin", { scope: "file" }, async ({}, { onCleanup }) => {
    const server = createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
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
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".xml": "application/xml",
      };
      response.writeHead(missing ? 404 : 200, {
        "Content-Type": types[extname(target)] ?? "application/octet-stream",
      });
      response.end(readFileSync(target));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    onCleanup(async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    });
    return origin;
  })
  .extend("sitePage", async ({ page }, { onCleanup }) => {
    page.setDefaultTimeout(10_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    onCleanup(() => expect(errors).toStrictEqual([]));
    return page;
  });

test("prerendered pages, sitemap and entry bundle meet publishing requirements", () => {
  const sitemap = readFileSync("site/sitemap.xml", "utf8");
  expect(sitemap).toContain(
    "https://kasperrt.github.io/smolter/docs/fetchers/",
  );
  expect(
    !sitemap.includes("/react/") &&
      !sitemap.includes("/preact/") &&
      !sitemap.includes("/tasks"),
  ).toBeTruthy();
  expect(sitemap, "Removed migration guide remains discoverable").not.toContain(
    "migration-0.3",
  );
  expect(existsSync("site/docs/migration-0.3/index.html")).toBeFalsy();
  const awaitHtml = readFileSync("site/docs/Await/index.html", "utf8");
  expect(awaitHtml).toContain("React 19+ provides use(promise)");
  expect(awaitHtml).toContain("https://react.dev/reference/react/use");
  const gettingStartedHtml = readFileSync(
    "site/docs/getting-started/index.html",
    "utf8",
  );
  expect(
    /href="(?:\/smolter)?\/(?:tasks|counter|examples\/counter)(?:[/?#"])/.test(
      gettingStartedHtml,
    ),
    "Guide must not link to retired demos",
  ).toBeFalsy();
  const landingHtml = readFileSync("site/index.html", "utf8");
  expect(
    landingHtml,
    "Root document must contain prerendered content",
  ).toContain("Data flow you can follow.");
  const entry = landingHtml.match(/<script[^>]+src="([^"]+\.js)"/)![1];
  const entryBytes = readFileSync(
    join("site", entry.replace(/^\/smolter\//, "")),
  );
  expect(
    gzipSync(entryBytes, { level: 9 }).length,
    "Site initial JavaScript exceeded its 28 kB gzip budget",
  ).toBeLessThan(28_000);
  expect(
    existsSync("site/react/assets"),
    "Do not publish a second React runtime for the site",
  ).toBeFalsy();
});

test("hydration preserves the landing page and article during navigation", async ({
  browser,
  origin,
}) => {
  const errors: string[] = [];
  const landing = await browser.newPage();
  const { promise: entryReady, resolve: releaseEntry } = deferred<void>();
  const landingScripts: string[] = [];
  landing.on("request", (request) => {
    if (request.resourceType() === "script") landingScripts.push(request.url());
  });
  await landing.route("**/assets/*.js", async (route) => {
    await entryReady;
    await route.continue();
  });
  await landing.route("**/*.woff2", (route) => route.abort());
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
  expect(
    await landing.evaluate(
      () => window.initialLanding === document.querySelector(".landing"),
    ),
    `landing was replaced during hydration`,
  ).toBeTruthy();
  expect(
    landingScripts.some((url) => /_smolter-doc_|\/source-/.test(url)),
    `unrelated content loaded on landing`,
  ).toBeFalsy();
  await landing.close();
  const articleScripts: string[] = [];
  const hydrated = await browser.newPage();
  hydrated.on("request", (request) => {
    if (request.resourceType() === "script") articleScripts.push(request.url());
  });
  hydrated.setDefaultTimeout(10_000);
  console.log(`checking pre-rendered documentation`);
  const { promise: scriptsReady, resolve: allowScripts } = deferred<void>();
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
  expect(await hydrated.title()).toBe(
    "Independent reads and writes · smolter docs",
  );
  expect(
    await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
  ).toBe("https://kasperrt.github.io/smolter/docs/fetchers/");
  expect(
    await hydrated.locator('meta[name="description"]').getAttribute("content"),
  ).toBeTruthy();
  expect(
    await hydrated.locator('meta[property="og:title"]').getAttribute("content"),
  ).toBe(await hydrated.title());
  expect(
    await hydrated.locator('meta[name="twitter:card"]').getAttribute("content"),
  ).toBe("summary_large_image");
  const structuredData = await hydrated
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(structuredData).toBeTruthy();
  const schema = JSON.parse(structuredData ?? "null");
  expect(schema.codeRepository).toBe("https://github.com/kasperrt/smolter");
  const icon = await hydrated.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toBeTruthy();
  const iconResponse = await hydrated.request.get(
    new URL(icon ?? "", hydrated.url()).href,
  );
  expect(iconResponse.ok()).toBeTruthy();
  expect(await iconResponse.text()).toContain('<path fill="#572849"');
  const image = await hydrated
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(image).toBeTruthy();
  expect(
    (
      await hydrated.request.get(origin + new URL(image ?? "", origin).pathname)
    ).ok(),
  ).toBeTruthy();
  await hydrated.evaluate(() => {
    window.initialArticle = document.querySelector(".docs-article");
  });
  allowScripts();
  await hydrated.waitForLoadState("networkidle");
  expect(
    await hydrated.evaluate(
      () => window.initialArticle === document.querySelector(".docs-article"),
    ),
    `${errors.join("\n")}`,
  ).toBeTruthy();
  expect(
    articleScripts.some((url) => /_smolter-doc_|\/source-/.test(url)),
    `SSR article was downloaded twice`,
  ).toBeFalsy();
  console.log(`hydration retained the article`);
  expect(await hydrated.locator(".docs-support > div").count()).toBe(4);
  const documentSupport = hydrated.locator(
    '.docs-sidebar a[href$="/docs/Document"] .docs-support-mini',
  );
  expect(await documentSupport.locator(".support-alternative").count()).toBe(0);
  expect(await documentSupport.locator(".support-yes").count()).toBe(4);
  const actionsLink = hydrated
    .getByRole("navigation", { name: "Documentation", exact: true })
    .getByRole("link", { name: "Actions", exact: true });
  const prefetched = hydrated.waitForResponse((response) =>
    response.url().includes("_smolter-doc_actions-"),
  );
  await actionsLink.hover();
  await prefetched;
  expect(hydrated.url()).toBe(`${origin}/smolter/docs/fetchers/`);
  await actionsLink.focus();
  await actionsLink.click();
  await hydrated
    .getByRole("heading", { name: "Actions", exact: true })
    .waitFor();
  expect(
    articleScripts.filter((url) => url.includes("_smolter-doc_")).length,
    `navigation should load only its article`,
  ).toBe(1);
  expect(
    articleScripts.some((url) => url.includes("_smolter-doc_actions-")),
  ).toBeTruthy();
  expect(
    await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
  ).toBe("https://kasperrt.github.io/smolter/docs/actions/");
  expect(
    await hydrated.locator('meta[property="og:title"]').getAttribute("content"),
  ).toBe("Actions · smolter docs");
  // A cold article must not replace the shared shell with a loading panel.
  const { promise: articleReady, resolve: releaseArticle } = deferred<void>();
  const { promise: requested, resolve: articleRequested } = deferred<void>();
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
    document
      .querySelector<HTMLAnchorElement>(
        '.docs-sidebar a[href$="/docs/loaders"]',
      )!
      .click();
  });
  await requested;
  expect(
    await hydrated.evaluate(
      () =>
        window.docsHeader === document.querySelector("header") &&
        window.docsSidebar === document.querySelector(".docs-sidebar") &&
        window.docsArticle === document.querySelector(".docs-article") &&
        document.querySelector(".docs-article h1")?.textContent === "Actions",
    ),
    "Pending article replaced the guide shell",
  ).toBeTruthy();
  releaseArticle();
  await hydrated
    .getByRole("heading", { name: "Loaders", exact: true })
    .waitFor();
  expect(
    await hydrated.evaluate(
      () =>
        window.docsDocument === document.documentElement &&
        window.docsHeader === document.querySelector("header") &&
        window.docsSidebar === document.querySelector(".docs-sidebar") &&
        window.docsArticle === document.querySelector(".docs-article"),
    ),
    "Article navigation remounted the shared layout",
  ).toBeTruthy();
  await hydrated.locator(".wordmark").click();
  await hydrated
    .getByRole("heading", { name: "Data flow you can follow.", exact: true })
    .waitFor();
  expect(await hydrated.title()).toBe(
    "smolter · Typed routing for React and Preact",
  );
  expect(
    await hydrated.locator('link[rel="canonical"]').getAttribute("href"),
  ).toBe("https://kasperrt.github.io/smolter/");
  expect(
    await hydrated.locator('meta[name="robots"]').getAttribute("content"),
  ).toBe("index,follow");
  await hydrated.close();
  expect(errors).toStrictEqual([]);
});

test("legacy framework links redirect to the guide", async ({
  sitePage: page,
  origin,
}) => {
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
});

test("bundle selector reflects measured sizes and respects reduced motion", async ({
  sitePage: page,
  origin,
}) => {
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
  expect(
    rising > combinations.preact[1][1] && rising < combinations.preact[3][1],
    "Total must count upward through intermediate values",
  ).toBeTruthy();
  expect(await selector.locator(".size-announcement").innerText()).toBe(
    `${combinations.preact[3][1].toLocaleString("en-US")} bytes gzip`,
  );
  await serverPages.uncheck();
  await page.clock.runFor(120);
  const falling = Number((await total.innerText()).replaceAll(",", ""));
  expect(
    falling < rising && falling > combinations.preact[1][1],
    "Rapid changes must retarget downward from the displayed value",
  ).toBeTruthy();
  await page.clock.runFor(400);
  expect(await total.innerText()).toBe(
    combinations.preact[1][1].toLocaleString("en-US"),
  );
  await page.clock.resume();
  await expect(total).toHaveText(
    combinations.preact[1][1].toLocaleString("en-US"),
  );
  expect(
    await selector
      .getByRole("checkbox", { name: "Paths, links & history" })
      .isDisabled(),
  ).toBeTruthy();
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
  expect(
    await selector
      .getByRole("checkbox", { name: "Load and save data" })
      .isDisabled(),
  ).toBeTruthy();
  expect(
    await selector
      .getByRole("checkbox", { name: "Load and save data" })
      .isChecked(),
  ).toBeTruthy();
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
  expect(
    await selector
      .getByRole("radio", { name: "Preact", exact: true })
      .isChecked(),
  ).toBeTruthy();
  await expect(total).toHaveText(
    combinations.preact[3][1].toLocaleString("en-US"),
  );
  await page.keyboard.press("ArrowRight");
  expect(await reactChoice.isChecked()).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await reactChoice.evaluate(
      (input) => getComputedStyle(input.parentElement!).transitionDuration,
    ),
  ).toBe("0s");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await selector.getByRole("radio", { name: "Preact", exact: true }).check();
  await page.clock.runFor(80);
  expect(await total.innerText()).toBe(
    combinations.preact[3][1].toLocaleString("en-US"),
  );
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  console.log(
    "Pages: selector keyboard, reduced motion, dependencies and measured totals passed",
  );
  const comparisons = page.getByRole("table", {
    name: "Bundle sizes · gzip bytes",
  });
  expect(await comparisons.innerText()).toContain(
    String(sizes.reactRouterData),
  );
  for (const framework of ["react", "preact"]) {
    await selector
      .getByRole("radio", {
        name: framework === "react" ? "React" : "Preact",
        exact: true,
      })
      .check();
    await serverPages.uncheck();
    for (const data of [false, true]) {
      await selector
        .getByRole("checkbox", { name: "Load and save data" })
        .setChecked(data);
      const row = comparisons.getByRole("row", {
        name: data ? /smolter common routing/ : /smolter routing-only/,
      });
      const cell = row.getByRole("cell").nth(framework === "react" ? 0 : 1);
      const expected = Number(await cell.innerText());
      expect(expected).toBe(combinations[framework][data ? 1 : 0][1]);
      expect(expected).toBe(
        sizes[`${framework}${data ? "Common" : "Routing"}`],
      );
      await expect(total).toHaveText(expected.toLocaleString("en-US"));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("opening a guide retains usable content while its article loads", async ({
  sitePage: page,
  origin,
}) => {
  await page.goto(`${origin}/smolter/`);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("heading", { name: "Data flow you can follow.", exact: true })
    .waitFor();
  const { promise: guideReady, resolve: releaseGuide } = deferred<void>();
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
    document
      .querySelector<HTMLAnchorElement>(
        'header a[href$="/docs/getting-started"]',
      )!
      .click();
  });
  console.log("Pages: waiting for cold guide request");
  await guideRequested;
  expect(
    await page.evaluate(
      () =>
        window.landingBeforeGuide === document.querySelector(".landing") &&
        window.headerBeforeGuide === document.querySelector("header"),
    ),
    "Opening docs replaced usable content with a loading panel",
  ).toBeTruthy();
  expect(
    await page.getByText("Loading documentation…", { exact: true }).count(),
  ).toBe(0);
  releaseGuide();
  await page
    .getByRole("heading", { name: "Getting started", exact: true })
    .waitFor();
});

test("deep links serve the matching guide or missing-page metadata", async ({
  sitePage: page,
  origin,
}) => {
  await page.goto(`${origin}/smolter/?__route=/tasks/2`);
  await page
    .getByRole("heading", { name: "Data flow you can follow.", exact: true })
    .waitFor();
  expect(new URL(page.url()).pathname).toBe("/smolter/");
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
      expect(existsSync(`site/${path}/index.html`)).toBeFalsy();
      const response = await page.goto(`${origin}/smolter/${path}`);
      expect(response?.status()).toBe(404);
      await page
        .getByRole("heading", { name: "Page not found", exact: true })
        .waitFor();
      expect(page.url()).toBe(`${origin}/smolter/${path}`);
      expect(
        await page.locator('meta[name="robots"]').getAttribute("content"),
      ).toBe("noindex,follow");
    }
  }
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
  expect(await page.locator(".docs-article").innerText()).toMatch(
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
  for (const slug of ["constructor", "__proto__", "missing-page"]) {
    await page.goto(`${origin}/smolter/docs/${slug}`);
    await page
      .getByText("Documentation page not found", { exact: true })
      .waitFor();
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content"),
    ).toBe("noindex,follow");
  }
});
