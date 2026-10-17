import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  dispatchRoute,
  renderApplication,
} from "@kasperrt/smolter/preact/server";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { expect, test } from "@playwright/test";
import { createElement } from "preact";
import { renderToReadableStream } from "preact-render-to-string/stream";
import { build } from "vite";
import { Destination, Home, root } from "../fixtures/ownership-page.tsx";
import { PreactRoot } from "../fixtures/preact-ownership.tsx";

for (const mode of [
  "navigate",
  "race",
  "return",
  "opposite",
  "nested",
  "root",
  "root-first",
  "repeat",
  "reject-after",
  "revalidate",
  "history",
  "disconnect",
  "disconnect-real",
  "preact-only",
]) {
  const pure = mode === "preact-only";
  const disconnect = mode.startsWith("disconnect");
  test(`retains only owned streaming content: ${mode}`, async ({ page }) => {
    const output = await mkdtemp(join(tmpdir(), "smolter-ownership-"));
    const result = await build({
      configFile: false,
      define: { DEFERRED_TIMEOUT: disconnect ? "2000" : "30000" },
      logLevel: "silent",
      build: {
        outDir: output,
        rollupOptions: {
          input: resolve(
            pure
              ? "tests/fixtures/preact-ownership-client.tsx"
              : "tests/fixtures/ownership-client.tsx",
          ),
        },
      },
    });
    if (!("output" in result)) throw new Error("Missing build output");
    const entry = result.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    )!;
    let settle!: (value: string) => void;
    const optional = new Promise<string>((done) => {
      settle = done;
    });
    let fail!: (error: Error) => void;
    let secondSettle!: (value: string) => void;
    const nested = new Promise<string>((_resolve, reject) => {
      fail = reject;
    });
    void nested.catch(() => {});
    const second = new Promise<string>((resolve) => {
      secondSettle = resolve;
    });
    let rootSettle!: (value: string) => void;
    const rootPending = new Promise<string>((resolve) => {
      rootSettle = resolve;
    });
    let documentResponse: ServerResponse | undefined;
    let aborted = 0;
    let rootLoads = 0;
    const hasRoot = ["root", "root-first", "revalidate"].includes(mode);
    const rootLoader = () => {
      rootLoads++;
      return { optional: hasRoot ? rootPending : undefined };
    };
    let loads = 0;
    const routes = [
      {
        path: "/",
        default: Home,
        loader: () => {
          loads++;
          return {
            optional:
              loads === 1
                ? ["nested", "reject-after"].includes(mode)
                  ? Promise.resolve({ nested })
                  : optional
                : "Current route content",
            ...(mode === "opposite" && { second }),
          };
        },
      },
      {
        path: "/root-data",
        loader: () => {
          rootLoads++;
          return { optional: "Current root content" };
        },
      },
      { path: "/destination", default: Destination, loader: () => ({}) },
    ];
    const handle = createRequestHandler({
      entry: `/${entry.fileName}`,
      build: {
        default: (request, entry) => {
          request.signal.addEventListener(
            "abort",
            () => {
              aborted++;
            },
            { once: true },
          );
          return renderApplication(
            request,
            routes,
            { ...root, loader: rootLoader },
            entry,
            {
              earlyHydration: true,
            },
          );
        },
        handleDataRequest: (request) => dispatchRoute(request, routes),
      },
    });
    const server = createServer((incoming, outgoing) => {
      const path = new URL(incoming.url!, "http://local").pathname;
      if (path.startsWith("/assets/")) {
        void readFile(join(output, path.slice(1))).then((body) => {
          outgoing.setHeader("Content-Type", "application/javascript");
          outgoing.end(body);
        });
        return;
      }
      if (pure) {
        outgoing.setHeader("Content-Type", "text/html");
        const stream = renderToReadableStream(
          createElement(PreactRoot, {
            optional,
            entry: `/${entry.fileName}`,
          }),
        );
        void pipeline(
          Readable.fromWeb(
            stream as import("node:stream/web").ReadableStream<Uint8Array>,
          ),
          outgoing,
        ).catch((error: Error) => {
          outgoing.destroy(error);
        });
        return;
      }
      if (path === "/") documentResponse = outgoing;
      void handle(incoming, outgoing, (error) => {
        outgoing.destroy(error as Error);
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    await Promise.resolve()
      .then(async () => {
        if (mode === "disconnect") await page.clock.install();
        const errors: string[] = [];
        const failedRequests: string[] = [];
        page.on("requestfailed", (request) =>
          failedRequests.push(
            `${request.url()}: ${request.failure()?.errorText}`,
          ),
        );
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${address.port}`, {
          waitUntil: "commit",
        });
        await expect(page.locator("html")).toHaveAttribute(
          "data-hydrated",
          "true",
        );
        await expect(
          page.getByText(
            ["nested", "reject-after"].includes(mode)
              ? "Nested data pending"
              : "Optional data pending",
            { exact: true },
          ),
        ).toBeVisible();
        if (!pure) {
          await page.getByLabel("Persistent draft").fill("Retain this");
          await page.getByRole("button", { name: "Count 0" }).click();
        }
        if (mode === "opposite") {
          secondSettle("Second resolved content");
          await expect(
            page.getByText("Second resolved content", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText("Optional data pending", { exact: true }),
          ).toBeVisible();
        }
        if (mode === "nested") {
          fail(new Error("Nested rejected"));
          await expect(
            page.getByText("Nested failed", { exact: true }),
          ).toBeVisible();
        }
        if (mode === "revalidate") {
          await page
            .getByRole("button", { name: "Refresh root", exact: true })
            .click();
          await expect(
            page.getByText("Current root content", { exact: true }),
          ).toBeVisible();
        }
        if (disconnect) {
          documentResponse!.destroy();
          await expect.poll(() => aborted).toBe(1);
          await expect.poll(() => failedRequests.length).toBeGreaterThan(0);
          if (mode === "disconnect") await page.clock.runFor(2001);
          await test.info().attach("interrupted-document", {
            body: JSON.stringify({
              failedRequests,
              browser: await page.evaluate(() => ({
                readyState: document.readyState,
                main: document.querySelector("main")?.outerHTML,
              })),
            }),
            contentType: "application/json",
          });
          await expect(
            page.getByText("Optional failed", { exact: true }),
          ).toBeVisible();
          await expect.poll(() => aborted).toBe(1);
        }
        if (mode === "race") settle("Old resolved content");
        await page
          .getByRole("button", { name: "Navigate", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Destination ready" }),
        ).toBeVisible();
        if (mode === "return") {
          await page
            .getByRole("button", { name: "Return", exact: true })
            .click();
          await expect(
            page.getByText("Current route content", { exact: true }),
          ).toBeVisible();
        }
        if (mode === "history") {
          await page.evaluate(() => history.back());
          await expect(
            page.getByText("Current route content", { exact: true }),
          ).toBeVisible();
          await page.evaluate(() => history.forward());
          await expect(
            page.getByRole("heading", { name: "Destination ready" }),
          ).toBeVisible();
        }
        if (mode === "repeat") {
          for (let index = 0; index < 3; index++) {
            await page
              .getByRole("button", { name: "Return", exact: true })
              .click();
            await expect(
              page.getByText("Current route content", { exact: true }),
            ).toBeVisible();
            await page
              .getByRole("button", { name: "Navigate", exact: true })
              .click();
            await expect(
              page.getByRole("heading", { name: "Destination ready" }),
            ).toBeVisible();
          }
        }
        if (mode === "reject-after") fail(new Error("Abandoned rejection"));
        if (mode === "root-first") {
          rootSettle("Original root content");
          await expect(
            page
              .getByRole("main")
              .getByText("Original root content", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("heading", { name: "Destination ready" }),
          ).toBeVisible();
          await expect(
            page.getByText("Optional data pending", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Old resolved content", { exact: true }),
          ).toHaveCount(0);
        }
        if (!pure) await page.getByLabel("Persistent draft").focus();
        if (pure)
          await page.evaluate(() =>
            window.dispatchEvent(new Event("settle-test")),
          );
        settle("Old resolved content");
        secondSettle("Second resolved content");
        if (mode === "root") {
          await expect(
            page.getByRole("heading", { name: "Destination ready" }),
          ).toBeVisible();
          await expect(
            page.getByText("Optional data pending", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Old resolved content", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByText("Root data pending", { exact: true }),
          ).toBeVisible();
        }
        rootSettle("Original root content");
        if (!disconnect) await page.waitForLoadState("load");
        if (mode !== "return")
          await expect(
            page.getByRole("heading", { name: "Destination ready" }),
          ).toBeVisible();
        await expect
          .soft(page.getByText("Optional data pending", { exact: true }))
          .toHaveCount(0);
        await expect
          .soft(page.getByText("Old resolved content", { exact: true }))
          .toHaveCount(0);
        await expect
          .soft(page.getByText("Second data pending", { exact: true }))
          .toHaveCount(0);
        await expect
          .soft(page.getByText("Second resolved content", { exact: true }))
          .toHaveCount(0);
        await expect
          .soft(page.getByText("Nested data pending", { exact: true }))
          .toHaveCount(0);
        if (mode === "root")
          await expect(
            page
              .getByRole("main")
              .getByText("Original root content", { exact: true }),
          ).toBeVisible();
        if (mode === "revalidate") {
          await expect(
            page.getByText("Current root content", { exact: true }),
          ).toBeVisible();
          await expect
            .soft(page.getByText("Root data pending", { exact: true }))
            .toHaveCount(0);
          await expect
            .soft(page.getByText("Original root content", { exact: true }))
            .toHaveCount(0);
          expect(rootLoads).toBe(2);
        }
        await expect(
          page.getByText("Nested failed", { exact: true }),
        ).toHaveCount(0);
        expect(errors).toEqual([]);
        if (!pure) {
          await expect(page.getByLabel("Persistent draft")).toHaveValue(
            "Retain this",
          );
          await expect(
            page.getByRole("button", { name: "Count 1" }),
          ).toBeVisible();
          if (mode !== "return")
            expect(
              new URL(page.url()).pathname +
                new URL(page.url()).search +
                new URL(page.url()).hash,
            ).toBe("/destination?pending=1#scope");
          expect(loads).toBe(
            mode === "repeat"
              ? 4
              : ["return", "history"].includes(mode)
                ? 2
                : 1,
          );
          await expect(page.getByLabel("Persistent draft")).toBeFocused();
        }
      })
      .finally(async () => {
        settle("Old resolved content");
        secondSettle("Second resolved content");
        rootSettle("Original root content");
        fail(new Error("Test ended"));
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
        await rm(output, { recursive: true, force: true });
      });
  });
}
