import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import {
  dispatchRoute,
  renderApplication,
} from "@kasperrt/smolter/preact/server";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { expect, test } from "@playwright/test";
import { safeWrapAsync } from "@smolter/core";
import { build } from "vite";
import {
  OptionalDestination,
  OptionalHome,
  optionalRoot,
} from "../fixtures/optional-page.tsx";

for (const scenario of [
  "settle",
  "navigate",
  "mode",
  "failure",
  "malformed",
  "offline",
]) {
  test(`independent optional loading: ${scenario}`, async ({ page }) => {
    const output = await mkdtemp(join(tmpdir(), "smolter-optional-"));
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: output,
        rollupOptions: { input: resolve("tests/fixtures/optional-client.tsx") },
      },
    });
    if (!("output" in result)) throw new Error("Missing output");
    const entry = result.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    )!;
    const requests: string[] = [];
    const gates: (() => void)[] = [];
    let mutations = 0;
    let loads = 0;
    let failures = ["failure", "malformed"].includes(scenario);
    const routes = [
      {
        path: "/",
        default: OptionalHome,
        loader: ({ request }: { request: Request }) => {
          loads++;
          return {
            strategy: "request",
            mode: new URL(request.url).searchParams.get("mode") ?? "music",
          };
        },
      },
      {
        path: "/destination",
        default: OptionalDestination,
        loader: () => ({}),
      },
      { path: "/profile", action: () => ++mutations },
    ];
    const handle = createRequestHandler({
      entry: `/${entry.fileName}`,
      build: {
        default: (request, entry) =>
          renderApplication(request, routes, optionalRoot, entry),
        handleDataRequest: (request) => dispatchRoute(request, routes),
      },
    });
    const server = createServer(async (incoming, outgoing) => {
      const url = new URL(incoming.url!, "http://fixture");
      requests.push(url.pathname + url.search);
      if (url.pathname.startsWith("/assets/")) {
        const body = await readFile(join(output, url.pathname.slice(1)));
        outgoing.setHeader("Content-Type", "application/javascript");
        outgoing.end(body);
        return;
      }
      if (url.pathname === "/stats") {
        gates.push(() => {
          if (outgoing.writableEnded || outgoing.destroyed) return;
          outgoing.setHeader("Content-Type", "application/json");
          outgoing.statusCode = failures && scenario === "failure" ? 503 : 200;
          outgoing.end(
            failures && scenario === "malformed"
              ? '"invalid"'
              : url.searchParams.get("mode") === "watch"
                ? "22"
                : "11",
          );
        });
        return;
      }
      if (url.pathname === "/manifest.json") {
        outgoing.setHeader("Content-Type", "application/json");
        outgoing.end('{"version":"experiment"}');
        return;
      }
      void handle(incoming, outgoing, (error) =>
        outgoing.destroy(error as Error),
      );
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const { error: testError } = await safeWrapAsync(async () => {
      if (scenario === "offline")
        await page.route("**/stats?*", (route) =>
          route.abort("internetdisconnected"),
        );
      await page.goto(`http://127.0.0.1:${address.port}`);
      await expect(page.locator("html")).toHaveAttribute(
        "data-hydrated",
        "true",
      );
      expect(await page.evaluate(() => document.readyState)).toBe("complete");
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Profile name" })
        .fill("Retain draft");
      await page.getByRole("button", { name: "Save profile" }).click();
      await expect(page.getByText("Profile saved")).toBeVisible();
      expect(mutations).toBe(1);
      expect(loads).toBe(1);
      expect(requests.filter((url) => url === "/manifest.json")).toHaveLength(
        0,
      );
      if (scenario === "offline") {
        await expect(page.getByText("Statistics unavailable")).toBeVisible();
        await page.unroute("**/stats?*");
        await page.getByRole("button", { name: "Retry statistics" }).click();
      }
      await expect.poll(() => gates.length).toBe(1);
      if (scenario === "navigate") {
        await page
          .getByRole("button", { name: "Navigate", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Destination ready" }),
        ).toBeVisible();
        gates[0]();
        await expect(
          page.getByRole("region", { name: "Statistics" }),
        ).toHaveCount(0);
        await expect(page).toHaveURL(/destination\?pending=1#scope$/);
        await page.goBack();
        await expect.poll(() => gates.length).toBe(2);
        gates[1]();
      } else if (scenario === "mode") {
        await page.getByRole("button", { name: "Watch", exact: true }).click();
        await expect.poll(() => gates.length).toBe(2);
        gates[1]();
        await expect(page.getByText("Total 22")).toBeVisible();
        gates[0]();
        await expect(page.getByText("Total 11")).toHaveCount(0);
      } else {
        gates[0]();
        if (failures) {
          await expect(page.getByText("Statistics unavailable")).toBeVisible();
          failures = false;
          await page.getByRole("button", { name: "Retry statistics" }).click();
          await expect.poll(() => gates.length).toBe(2);
          gates[1]();
        }
      }
      await expect(
        page.getByText(scenario === "mode" ? "Total 22" : "Total 11"),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Profile name" }),
      ).toHaveValue("Retain draft");
      expect(mutations).toBe(1);
      expect(errors).toEqual([]);
      const assets = result.output
        .filter((item) => item.type === "chunk")
        .map((item) => ({
          file: item.fileName,
          raw: Buffer.byteLength(item.code),
          gzip: gzipSync(item.code, { level: 9 }).length,
          brotli: brotliCompressSync(item.code).length,
        }));
      await test.info().attach("optional-results", {
        body: JSON.stringify(
          { scenario, loads, mutations, requests, assets },
          null,
          2,
        ),
        contentType: "application/json",
      });
    });
    for (const settle of gates) settle();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(output, { recursive: true, force: true });
    if (testError) throw testError.cause ?? testError;
  });
}
