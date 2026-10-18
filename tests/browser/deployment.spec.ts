import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type RequestListener } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { safeWrapAsync } from "@smolter/core";
import { build } from "vite";
import { deploymentPlugin } from "../../packages/vite/src/deployment.ts";

const cleanups: (() => Promise<unknown>)[] = [];
test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
for (const [mode, base] of [
  ["before", "/"],
  ["nonblocking", "/"],
  ["during", "/admin/"],
  ["prefetch", "/remotes/"],
  ["redirect", "/embed/custom/"],
  ["redirect-fast", "/admin/"],
  ["redirect-delayed", "/admin/"],
  ["overlap", "/casting/receiver/"],
  ["offline", "/"],
  ["history", "/"],
  ["cdn", "/embed/custom/"],
]) {
  const race = mode === "during";
  test(`recovers a production tab after deleted chunks (${mode}, ${base})`, async ({
    page,
    context,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-deployment-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    let active = join(root, "a");
    let finishRoot!: () => void;
    const rootPending = new Promise<void>((resolve) => {
      finishRoot = resolve;
    });
    cleanups.push(async () => finishRoot());
    const serve: RequestListener = async (request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      const path = new URL(request.url!, "http://local").pathname.slice(
        base.length - 1,
      );
      if (path === "/root-refresh") {
        await rootPending;
        response.end("done");
        return;
      }
      const file =
        path.startsWith("/assets/") || path.endsWith(".json")
          ? path.slice(1)
          : "index.html";
      const { data: content, error } = await safeWrapAsync(() =>
        readFile(join(active, file)),
      );
      if (error) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".json")
            ? "application/json"
            : "text/html",
      );
      response.end(content);
    };
    const server = createServer(serve);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    cleanups.push(
      () =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const origin = `http://127.0.0.1:${address.port}`;
    let assetBase = base;
    if (mode === "cdn") {
      const assets = createServer(serve);
      await new Promise<void>((done) => assets.listen(0, "127.0.0.1", done));
      cleanups.push(
        () =>
          new Promise<void>((done) => {
            assets.closeAllConnections();
            assets.close(() => done());
          }),
      );
      const address = assets.address();
      if (!address || typeof address === "string")
        throw new Error("Missing asset port");
      assetBase = `http://127.0.0.1:${address.port}${base}`;
    }
    for (const version of ["a", "b"]) {
      const directory = join(root, version);
      await mkdir(directory);
      await writeFile(
        join(directory, "index.html"),
        `<h1>${version} document</h1><button id="next">Next</button><button id="other">Other</button><input aria-label="Persistent note"><output></output><script type="module" src="/entry.ts"></script>`,
      );
      await writeFile(
        join(directory, "page.ts"),
        `export const text = "${version} route";`,
      );
      await writeFile(
        join(directory, "entry.ts"),
        `
        import { createDataRouter, safeWrapAsync } from ${JSON.stringify(resolve("packages/core/src/index.ts"))};
        import { watchDeployment } from ${JSON.stringify(resolve("packages/client/src/deployment.ts"))};
        import deployment from "virtual:smolter/deployment";
        const router = createDataRouter([
          { path: "${base}", loader: () => "${version} home" },
          { path: "${base}next", loader: async () => (await import("./page")).text },
          { path: "${base}other", loader: async () => (await import("./page")).text },
          { path: "${base}login", action: () => {
            sessionStorage.setItem("mutations", String(Number(sessionStorage.getItem("mutations")) + 1));
            return new Response(null, { status: 302, headers: { Location: "${base}next?tab=2#details" } });
          } },
        ], { browser: true });
        watchDeployment(router, ${mode === "nonblocking" ? "deployment && { ...deployment, timeout: 60_000 }" : "deployment"});
        router.registerRevalidator("root", async () => {
          sessionStorage.setItem("roots", String(Number(sessionStorage.getItem("roots")) + 1));
          ${mode.startsWith("redirect-") ? 'await fetch("' + base + 'root-refresh");' : ""}
        });
        router.subscribe(() => { document.querySelector("output").textContent = router.getSnapshot().data || ""; });
        router.start();
        ${mode === "prefetch" ? 'document.querySelector("button").onpointerenter = () => void safeWrapAsync(() => import("./page"));' : ""}
        document.querySelector("#next").onclick = () => ${mode.startsWith("redirect") ? 'router.submit("' + base + 'login", new FormData())' : 'router.navigate("' + base + 'next?tab=2#details")'};
        document.querySelector("#other").onclick = () => router.navigate("${base}other?tab=3#latest");
      `,
      );
      await build({
        root: directory,
        base: assetBase,
        configFile: false,
        logLevel: "silent",
        plugins: [deploymentPlugin()],
        build: { outDir: directory, emptyOutDir: false },
      });
    }
    const oldManifest = await readFile(
      join(active, "smolter-manifest.json"),
      "utf8",
    );
    await page.goto(origin + base);
    await expect(page.locator("output")).toHaveText("a home");
    if (race) {
      await page.route(
        "**/smolter-manifest.json",
        (route) =>
          route.fulfill({ contentType: "application/json", body: oldManifest }),
        { times: 1 },
      );
    }
    if (mode === "nonblocking") {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/smolter-manifest.json", async (route) => {
        await pending;
        await route.fulfill({
          contentType: "application/json",
          body: await readFile(
            join(root, "b", "smolter-manifest.json"),
            "utf8",
          ),
        });
      });
      await page
        .getByRole("textbox", { name: "Persistent note" })
        .fill("Retain this input");
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.locator("output")).toHaveText("a route");
      await expect(page).toHaveURL(`${origin}${base}next?tab=2#details`);
      const manifest = page.waitForResponse("**/smolter-manifest.json");
      release();
      await (await manifest).finished();
      await expect(
        page.getByRole("textbox", { name: "Persistent note" }),
      ).toHaveValue("Retain this input");
      await expect(page.locator("h1")).toHaveText("a document");
      active = join(root, "b");
      await page.getByRole("button", { name: "Other" }).click();
      await expect(page.locator("h1")).toHaveText("b document");
      await expect(page.locator("output")).toHaveText("b route");
      await expect(page).toHaveURL(`${origin}${base}other?tab=3#latest`);
      return;
    }
    active = join(root, "b");
    if (mode === "prefetch") {
      const failedChunk = page.waitForResponse(
        (response) =>
          response.url().includes("/assets/page-") && response.status() === 404,
      );
      await page.getByRole("button", { name: "Next" }).hover();
      await failedChunk;
      await page.waitForTimeout(100);
      await expect(page.locator("h1")).toHaveText("a document");
      await expect(page).toHaveURL(origin + base);
    }
    if (mode === "offline") {
      await context.setOffline(true);
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page).toHaveURL(`${origin}${base}next?tab=2#details`);
      await expect(page.locator("h1")).toHaveText("a document");
      expect(
        await page.evaluate(() =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("smolter:deployment:"),
          ),
        ),
      ).toEqual([]);
      await context.setOffline(false);
      await page.getByRole("button", { name: "Other" }).click();
      await expect(page.locator("h1")).toHaveText("b document");
      await expect(page.locator("output")).toHaveText("b route");
      await expect(page).toHaveURL(`${origin}${base}other?tab=3#latest`);
      return;
    }
    if (mode === "overlap" || mode === "history") {
      let release!: () => void;
      let requested!: () => void;
      const pending = new Promise<void>((done) => {
        release = done;
      });
      const started = new Promise<void>((done) => {
        requested = done;
      });
      await page.route("**/smolter-manifest.json", async (route) => {
        requested();
        await pending;
        await route.continue();
      });
      if (mode === "history") {
        await page.evaluate(() => {
          history.pushState("back", "", "/previous");
          history.pushState("current", "", "/");
          history.back();
        });
        await started;
        await page.evaluate(() => history.forward());
        await expect(page).toHaveURL(origin + "/");
        release();
        await page.waitForTimeout(100);
        await expect(page.locator("h1")).toHaveText("a document");
        expect(
          await page.evaluate(() =>
            Object.keys(sessionStorage).filter((key) =>
              key.startsWith("smolter:deployment:"),
            ),
          ),
        ).toEqual([]);
      }
      if (mode === "overlap") {
        await page.getByRole("button", { name: "Next" }).click();
        await started;
        await page.getByRole("button", { name: "Other" }).click();
        release();
        await expect(page.locator("h1")).toHaveText("b document");
        await expect(page.locator("output")).toHaveText("b route");
        await expect(page).toHaveURL(`${origin}${base}other?tab=3#latest`);
        return;
      }
    }
    if (mode.startsWith("redirect-")) {
      let releaseManifest!: () => void;
      const manifestPending = new Promise<void>((resolve) => {
        releaseManifest = resolve;
      });
      cleanups.push(async () => releaseManifest());
      if (mode === "redirect-delayed")
        await page.route("**/smolter-manifest.json", async (route) => {
          await manifestPending;
          await route.continue();
        });
      const manifest = page.waitForResponse("**/smolter-manifest.json");
      const rootRequest = page.waitForRequest("**/root-refresh");
      await page.getByRole("button", { name: "Next" }).click();
      await rootRequest;
      if (mode === "redirect-fast") {
        await (await manifest).finished();
        await expect(page.locator("h1")).toHaveText("a document");
        expect(
          await page.evaluate(() =>
            Object.keys(sessionStorage).filter((key) =>
              key.startsWith("smolter:deployment:"),
            ),
          ),
        ).toEqual([]);
        finishRoot();
      } else {
        const refreshed = page.waitForResponse("**/root-refresh");
        finishRoot();
        await (await refreshed).finished();
        releaseManifest();
      }
    } else {
      await page.getByRole("button", { name: "Next" }).click();
    }
    await expect(page.locator("h1")).toHaveText("b document");
    await expect(page.locator("output")).toHaveText("b route");
    await expect(page).toHaveURL(`${origin}${base}next?tab=2#details`);
    if (mode.startsWith("redirect")) {
      expect(
        await page.evaluate(() => sessionStorage.getItem("mutations")),
      ).toBe("1");
      expect(await page.evaluate(() => sessionStorage.getItem("roots"))).toBe(
        "1",
      );
    }
    await page.close();
  });
}
