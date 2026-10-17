import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  dispatchRoute,
  renderApplication,
} from "@kasperrt/smolter/react/server";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { send, webRequest } from "../../packages/server/src/http.ts";
import { Destination, Home, root } from "../fixtures/react-streaming-page.tsx";

for (const navigate of [false, true]) {
  test(`React production SSR retains shell through ${navigate ? "abandoned" : "settled"} deferred content`, async ({
    page,
  }) => {
    const output = await mkdtemp(join(tmpdir(), "smolter-react-stream-"));
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: output,
        minify: true,
        rollupOptions: {
          input: resolve("tests/fixtures/react-streaming-client.tsx"),
        },
      },
    });
    if (!("output" in result)) throw new Error("Missing build");
    const entry = result.output.find(
      (chunk) => chunk.type === "chunk" && chunk.isEntry,
    )!;
    let release!: () => void;
    const optional = new Promise<string>((done) => {
      release = () => done("Optional resolved");
    });
    let loads = 0;
    let mutations = 0;
    let roots = 0;
    const routes = [
      {
        path: "/",
        default: Home,
        loader: () => {
          loads++;
          return { optional };
        },
      },
      { path: "/destination", default: Destination },
      {
        path: "/save",
        action: () => {
          mutations++;
          return { saved: true };
        },
      },
      { path: "/session", loader: () => ({ revision: ++roots }) },
    ];
    const server = createServer((incoming, outgoing) => {
      const path = new URL(incoming.url!, "http://local").pathname;
      const run = async () => {
        if (path.startsWith("/assets/")) {
          outgoing.setHeader("Content-Type", "application/javascript");
          outgoing.end(await readFile(join(output, path.slice(1))));
          return;
        }
        if (path === "/style.css") {
          outgoing.setHeader("Content-Type", "text/css");
          outgoing.end("main {color: rgb(20, 30, 40)}");
          return;
        }
        const target =
          path === "/_smolter"
            ? new URL(incoming.url!, "http://local").searchParams.get("url")!
            : undefined;
        const request = await webRequest(incoming, outgoing, target);
        let response = target
          ? await dispatchRoute(request, routes)
          : await renderApplication(
              request,
              routes,
              { ...root, loader: () => ({ revision: 0 }) },
              `/${entry.fileName}`,
              { earlyHydration: true, nonce: "react-fixture" },
            );
        response.headers.set(
          "Content-Security-Policy",
          "script-src 'nonce-react-fixture' 'strict-dynamic'; object-src 'none'",
        );
        if (!target && response.body) {
          const decoder = new TextDecoder();
          response = new Response(
            response.body.pipeThrough(
              new TransformStream({
                transform(chunk, controller) {
                  const text = decoder
                    .decode(chunk, { stream: true })
                    .replace(
                      "<head>",
                      '<head><script nonce="react-fixture" data-smolter-preserve>window.auditRuns=(window.auditRuns||0)+1</script><style data-smolter-preserve>html {--preserved-style: yes}</style>',
                    );
                  controller.enqueue(new TextEncoder().encode(text));
                },
              }),
            ),
            { status: response.status, headers: response.headers },
          );
        }
        await send(response, outgoing);
      };
      void run().catch((error) => {
        if (!outgoing.destroyed) outgoing.destroy(error);
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${address.port}/`, {
        waitUntil: "commit",
      });
      await expect(page.getByText("Optional data pending")).toBeVisible();
      await page.getByRole("button", { name: "Count 0" }).click();
      await expect(page.getByRole("button", { name: "Count 1" })).toBeVisible();
      expect(await page.evaluate(() => document.readyState)).toBe("loading");
      await page.getByLabel("Draft").fill("Keep input");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.getByLabel("Root revision")).toHaveText("1");
      expect(mutations).toBe(1);
      if (navigate) {
        await page.getByRole("button", { name: "Navigate" }).click();
        await expect(
          page.getByRole("heading", { name: "Destination ready" }),
        ).toBeVisible();
        await expect(page.getByText("Optional data pending")).toHaveCount(0);
      }
      release();
      await page.waitForLoadState("load");
      await expect(page.getByText("Optional data pending")).toHaveCount(0);
      await expect(page.getByText("Optional resolved")).toHaveCount(
        navigate ? 0 : 1,
      );
      await expect(page.getByLabel("Draft")).toHaveValue("Keep input");
      await expect(page.getByRole("button", { name: "Count 1" })).toBeVisible();
      if (navigate)
        expect(
          new URL(page.url()).pathname +
            new URL(page.url()).search +
            new URL(page.url()).hash,
        ).toBe("/destination?pending=1#scope");
      expect(
        await page.evaluate(() => ({
          runs: Reflect.get(window, "auditRuns"),
          style: getComputedStyle(document.documentElement)
            .getPropertyValue("--preserved-style")
            .trim(),
          marked: document.head.querySelectorAll("[data-smolter-preserve]")
            .length,
        })),
      ).toEqual({ runs: 1, style: "yes", marked: 2 });
      expect(loads).toBe(1);
      expect(roots).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      release();
      await page.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(output, { recursive: true, force: true });
    }
  });
}
