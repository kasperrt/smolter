import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

// This is a comparative fixture, not a timing threshold for shared CI hosts.
for (const strategy of ["stream", "request"] as const) {
  test(`measure optional loading: ${strategy}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const output = await mkdtemp(
      join(tmpdir(), "smolter-optional-performance-"),
    );
    const result = await build({
      configFile: false,
      logLevel: "silent",
      plugins: [
        {
          name: "fixture-strategy",
          transform(code, id) {
            if (id.endsWith("optional-page.tsx"))
              return code.replace(
                'data.strategy === "stream"',
                String(strategy === "stream"),
              );
          },
        },
      ],
      build: {
        outDir: output,
        rollupOptions: { input: resolve("tests/fixtures/optional-client.tsx") },
      },
    });
    if (!("output" in result)) throw new Error("Missing output");
    const entry = result.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    )!;
    let delay = 0;
    let serverDelay = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const statistics = () =>
      new Promise<number>((done) => {
        const started = performance.now();
        const timer = setTimeout(() => {
          serverDelay = performance.now() - started;
          timers.delete(timer);
          done(11);
        }, delay);
        timers.add(timer);
      });
    const routes = [
      {
        path: "/",
        default: OptionalHome,
        loader: () => ({
          strategy,
          mode: "music",
          ...(strategy === "stream" && { stats: statistics() }),
        }),
      },
      {
        path: "/destination",
        default: OptionalDestination,
        loader: () => ({}),
      },
      { path: "/profile", action: () => 1 },
    ];
    const handle = createRequestHandler({
      entry: `/${entry.fileName}`,
      build: {
        default: (request, entry) =>
          renderApplication(request, routes, optionalRoot, entry, {
            earlyHydration: strategy === "stream",
          }),
        handleDataRequest: (request) => dispatchRoute(request, routes),
      },
    });
    const server = createServer(async (incoming, outgoing) => {
      const path = new URL(incoming.url!, "http://fixture").pathname;
      if (path.startsWith("/assets/")) {
        const body = await readFile(join(output, path.slice(1)));
        outgoing.setHeader("Content-Type", "application/javascript");
        outgoing.setHeader("Content-Encoding", "gzip");
        outgoing.setHeader("Cache-Control", "public, max-age=3600");
        outgoing.end(gzipSync(body, { level: 9 }));
        return;
      }
      if (path === "/stats") {
        const value = await statistics();
        outgoing.setHeader("Content-Type", "application/json");
        outgoing.end(String(value));
        return;
      }
      if (path === "/manifest.json") {
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
    const rows: unknown[] = [];
    const { error: testError } = await safeWrapAsync(async () => {
      for (const throttled of [false, true]) {
        for (const latency of process.env.SMOLTER_BENCH_DELAY
          ? [Number(process.env.SMOLTER_BENCH_DELAY)]
          : [0, 1500, 6000]) {
          delay = latency;
          for (let sample = 0; sample < 3; sample++) {
            const context = await browser.newContext();
            const page = await context.newPage();
            await page.addInitScript(() => {
              const metrics = { lcp: 0, cls: 0 };
              Object.assign(window, { optionalMetrics: metrics });
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries())
                  metrics.lcp = entry.startTime;
              }).observe({
                type: "largest-contentful-paint",
                buffered: true,
              });
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  const shift = entry as PerformanceEntry & {
                    hadRecentInput: boolean;
                    value: number;
                  };
                  if (!shift.hadRecentInput) metrics.cls += shift.value;
                }
              }).observe({ type: "layout-shift", buffered: true });
            });
            const cdp = await context.newCDPSession(page);
            await cdp.send("Network.enable");
            await cdp.send("Network.setCacheDisabled", {
              cacheDisabled: true,
            });
            if (throttled) {
              await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
              await cdp.send("Network.emulateNetworkConditions", {
                offline: false,
                latency: 80,
                downloadThroughput: 200000,
                uploadThroughput: 100000,
              });
            }
            await page.goto(`http://127.0.0.1:${address.port}`, {
              waitUntil: "commit",
            });
            await expect(page.locator("html")).toHaveAttribute(
              "data-hydrated",
              "true",
            );
            await page
              .getByRole("button", { name: "Settings", exact: true })
              .click();
            await expect(
              page.getByRole("textbox", { name: "Profile name" }),
            ).toBeVisible();
            const interaction = await page.evaluate(() => performance.now());
            await page
              .getByRole("textbox", { name: "Profile name" })
              .fill("Keep input");
            await expect(
              page
                .getByRole("region", { name: "Statistics" })
                .getByText("Total 11"),
            ).toBeVisible({
              timeout: 15000,
            });
            const optional = await page.evaluate(() => performance.now());
            await page.waitForLoadState("load");
            await expect(page.locator("preact-island")).toHaveCount(0);
            await expect(
              page.getByRole("textbox", { name: "Profile name" }),
            ).toHaveValue("Keep input");
            const timing = await page.evaluate(() => {
              const nav = performance.getEntriesByType(
                "navigation",
              )[0] as PerformanceNavigationTiming;
              const resources = performance.getEntriesByType(
                "resource",
              ) as PerformanceResourceTiming[];
              return {
                ...(
                  window as Window & {
                    optionalMetrics?: { lcp: number; cls: number };
                  }
                ).optionalMetrics,
                ttfb: nav.responseStart,
                complete: nav.responseEnd,
                js: resources
                  .filter((item) => item.name.includes("/assets/"))
                  .map((item) => ({
                    bytes: item.encodedBodySize,
                    duration: item.duration,
                  })),
                optionalRequests: resources.filter((item) =>
                  item.name.includes("/stats?"),
                ).length,
              };
            });
            rows.push({
              serverDelay,
              strategy,
              delay,
              throttled,
              sample,
              interaction,
              optional,
              ...timing,
            });
            await context.close();
          }
        }
      }
      const assets = result.output
        .filter((item) => item.type === "chunk")
        .map((item) => ({
          file: item.fileName,
          raw: Buffer.byteLength(item.code),
          gzip: gzipSync(item.code, { level: 9 }).length,
          brotli: brotliCompressSync(item.code).length,
        }));
      await writeFile(
        test.info().outputPath("measurements.json"),
        JSON.stringify({ strategy, assets, rows }, null, 2),
      );
      await test.info().attach("performance", {
        body: JSON.stringify({ strategy, assets, rows }, null, 2),
        contentType: "application/json",
      });
    });
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(output, { recursive: true, force: true });
    if (testError) throw testError.cause ?? testError;
  });
}
