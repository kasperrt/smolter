import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { renderApplication } from "../../packages/server/src/application.tsx";
import { send } from "../../packages/server/src/http.ts";
import { StreamingPage, streamingRoot } from "../fixtures/streaming-page.tsx";

for (const mode of ["values", "failures", "injected", "navigation", "csp"]) {
  const reject = mode === "failures";
  test(`streams the shell and hydrates deferred ${mode} without rerunning loaders`, async ({
    page,
  }) => {
    const output = await mkdtemp(join(tmpdir(), "smolter-stream-"));
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        outDir: output,
        rollupOptions: {
          input: resolve("tests/fixtures/streaming-client.tsx"),
        },
      },
    });
    if (!("output" in result)) throw new Error("Missing build output");
    const entry = result.output.find(
      (item) => item.type === "chunk" && item.isEntry,
    )!;
    let release!: () => void;
    let releaseLater!: () => void;
    const later = new Promise<string>((resolve) => {
      releaseLater = () => resolve("Later detail");
    });
    let loaderCalls = 0;
    let mutationCalls = 0;
    let started = 0;
    const pending = new Promise<string>((resolve, fail) => {
      release = () =>
        reject ? fail(new Error("Unavailable")) : resolve("Deferred detail");
    });
    const server = createServer((incoming, outgoing) => {
      const path = new URL(incoming.url!, "http://local").pathname;
      if (path === "/mutation") {
        mutationCalls++;
        outgoing.setHeader("Content-Type", "application/json");
        outgoing.end(String(mutationCalls));
        return;
      }
      if (path.startsWith("/assets/")) {
        void readFile(join(output, path.slice(1))).then((body) => {
          outgoing.setHeader("Content-Type", "application/javascript");
          outgoing.end(body);
        });
        return;
      }
      void renderApplication(
        new Request(`http://${incoming.headers.host}/`),
        [
          {
            path: "/",
            default: StreamingPage,
            loader: () => {
              loaderCalls++;
              started = Date.now();
              return { detail: pending, later };
            },
          },
        ],
        streamingRoot,
        `/${entry.fileName}`,
        { earlyHydration: true, nonce: "stream-test" },
      ).then(async (response) => {
        if (mode === "csp")
          response.headers.set(
            "Content-Security-Policy",
            "script-src 'nonce-stream-test' 'strict-dynamic'; object-src 'none'",
          );
        if (mode === "injected") {
          const html = (await response.text()).replace(
            "<head>",
            '<head><script data-smolter-preserve id="injected-script">window.injectedRuns = (window.injectedRuns || 0) + 1</script><meta data-smolter-preserve name="injected" content="preserve">',
          );
          return send(
            new Response(html, { headers: response.headers }),
            outgoing,
          );
        }
        return send(response, outgoing);
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (mode === "injected") {
      release();
      releaseLater();
    }
    await Promise.resolve()
      .then(async () => {
        await page.goto(`http://127.0.0.1:${address.port}`, {
          waitUntil: "commit",
        });
        await expect(
          page.getByRole("heading", { name: "Immediate shell" }),
        ).toBeVisible();
        if (mode !== "injected")
          await expect(
            page.getByRole("main").getByText("Pending detail"),
          ).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "data-hydrated",
          "true",
        );
        await page.getByRole("button", { name: "Save", exact: true }).click();
        await expect(page.getByLabel("Saved", { exact: true })).toHaveText("1");
        if (mode !== "injected") {
          await page.getByRole("button", { name: "Count 0" }).click();
          await expect(
            page.getByRole("button", { name: "Count 1" }),
          ).toBeVisible();
        }
        await page
          .getByRole("textbox", { name: "Draft" })
          .fill("Keep my input");
        if (mode !== "injected") {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, 1500 - (Date.now() - started))),
          );
          await expect(
            page.getByRole("main").getByText("Pending detail"),
          ).toBeVisible();
        }
        if (mode === "navigation") {
          await page.getByRole("link", { name: "Other route" }).click();
          await expect(
            page.getByRole("main").getByText("New route detail"),
          ).toBeVisible();
        }
        release();
        await expect(
          page
            .getByRole("main")
            .getByText(
              mode === "navigation"
                ? "New route detail"
                : reject
                  ? "Detail unavailable"
                  : "Deferred detail",
            ),
        ).toBeVisible();
        if (mode !== "injected" && mode !== "navigation")
          await expect(
            page.getByRole("main").getByText("Pending later"),
          ).toBeVisible();
        releaseLater();
        if (mode !== "navigation")
          await expect(
            page.getByRole("main").getByText("Later detail"),
          ).toBeVisible();
        await page
          .getByRole("button", {
            name: mode === "injected" ? "Count 0" : "Count 1",
          })
          .click();
        await expect(
          page.getByRole("button", {
            name: mode === "injected" ? "Count 1" : "Count 2",
          }),
        ).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
          "Keep my input",
        );
        await expect(page.locator("preact-island")).toHaveCount(0);
        expect(loaderCalls).toBe(1);
        expect(mutationCalls).toBe(1);
        expect(errors).toEqual([]);
        if (mode === "injected") {
          await expect(page.locator("#injected-script")).toHaveCount(1);
          await expect(page.locator('meta[name="injected"]')).toHaveCount(1);
          await expect(page.locator("#app-script")).toHaveCount(1);
          await expect(page.locator("main")).toHaveCSS(
            "color",
            "rgb(20, 30, 40)",
          );
          expect(await page.evaluate("window.appRuns")).toBe(1);
          expect(await page.evaluate("window.injectedRuns")).toBe(1);
        }
      })
      .finally(async () => {
        release();
        releaseLater();
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
        await rm(output, { recursive: true, force: true });
      });
  });
}
