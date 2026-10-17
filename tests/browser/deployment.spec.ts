import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { deploymentPlugin } from "../../packages/vite/src/deployment.ts";

const cleanups: (() => Promise<unknown>)[] = [];

test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

for (const race of [false, true]) {
  test(`recovers a production tab after deleted chunks (${race ? "deploy during import" : "deploy before navigation"})`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-deployment-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    let active = join(root, "a");
    const server = createServer((request, response) => {
      const path = new URL(request.url!, "http://local").pathname;
      const file =
        path.startsWith("/assets/") || path.endsWith(".json")
          ? path.slice(1)
          : "index.html";
      void readFile(join(active, file)).then(
        (content) => {
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
        },
        () => {
          response.writeHead(404);
          response.end();
        },
      );
    });
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

    for (const version of ["a", "b"]) {
      const directory = join(root, version);
      await mkdir(directory);
      await writeFile(
        join(directory, "index.html"),
        `<h1>${version} document</h1><button>Next</button><output></output><script type="module" src="/entry.ts"></script>`,
      );
      await writeFile(
        join(directory, "page.ts"),
        `export const text = "${version} route";`,
      );
      await writeFile(
        join(directory, "entry.ts"),
        `
        import { createDataRouter } from ${JSON.stringify(resolve("packages/core/src/index.ts"))};
        import { watchDeployment } from ${JSON.stringify(resolve("packages/client/src/deployment.ts"))};
        import deployment from "virtual:smolter/deployment";
        const router = createDataRouter([
          { path: "/", loader: () => "${version} home" },
          { path: "/next", loader: () => import("./page").then(module => module.text) },
        ], { browser: true });
        watchDeployment(router, deployment);
        router.subscribe(() => { document.querySelector("output").textContent = router.getSnapshot().data || ""; });
        router.start();
        document.querySelector("button").onclick = () => router.navigate("/next?tab=2#details");
      `,
      );
      await build({
        root: directory,
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
    await page.goto(origin);
    await expect(page.locator("output")).toHaveText("a home");
    if (race) {
      await page.route(
        "**/smolter-manifest.json",
        (route) =>
          route.fulfill({ contentType: "application/json", body: oldManifest }),
        { times: 1 },
      );
    }
    active = join(root, "b");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.locator("h1")).toHaveText("b document");
    await expect(page.locator("output")).toHaveText("b route");
    await expect(page).toHaveURL(`${origin}/next?tab=2#details`);
    await page.close();
  });
}
