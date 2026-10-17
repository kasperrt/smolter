import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { renderApplication } from "../../packages/server/src/application.tsx";
import { send } from "../../packages/server/src/http.ts";
import { StreamingPage, streamingRoot } from "../fixtures/streaming-page.tsx";

for (const reject of [false, true]) {
  test(`streams the shell and hydrates deferred ${reject ? "failures" : "values"} without rerunning loaders`, async ({
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
    const pending = new Promise<string>((resolve, fail) => {
      release = () =>
        reject ? fail(new Error("Unavailable")) : resolve("Deferred detail");
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
      void renderApplication(
        new Request("http://local/"),
        [
          {
            path: "/",
            default: StreamingPage,
            loader: () => ({ detail: pending }),
          },
        ],
        streamingRoot,
        `/${entry.fileName}`,
      ).then((response) => send(response, outgoing));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await Promise.resolve()
      .then(async () => {
        await page.goto(`http://127.0.0.1:${address.port}`, {
          waitUntil: "commit",
        });
        await expect(
          page.getByRole("heading", { name: "Immediate shell" }),
        ).toBeVisible();
        await expect(page.getByText("Pending detail")).toBeVisible();
        release();
        await expect(
          page.getByText(reject ? "Detail unavailable" : "Deferred detail"),
        ).toBeVisible();
        await page.getByRole("button", { name: "Count 0" }).click();
        await expect(
          page.getByRole("button", { name: "Count 1" }),
        ).toBeVisible();
        expect(errors).toEqual([]);
      })
      .finally(async () => {
        release();
        server.closeAllConnections();
        await new Promise<void>((done) => server.close(() => done()));
        await rm(output, { recursive: true, force: true });
      });
  });
}
