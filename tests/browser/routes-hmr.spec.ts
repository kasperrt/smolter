import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer } from "vite";
import { fileRouter } from "../../packages/vite/src/index.ts";

const cleanups: (() => Promise<unknown>)[] = [];

test.afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

for (const manual of [false, true]) {
  test(`refreshes live ${manual ? "manual" : "file"} routes without restarting Vite`, async ({
    page,
  }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "smolter-hmr-")));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "src/routes"), { recursive: true });
    await writeFile(
      join(root, "src/routes/_index.ts"),
      'export default function Home() { return "Home"; }',
    );
    await writeFile(
      join(root, "routes.ts"),
      'export const routes = [{ path: "/" }];',
    );
    await writeFile(
      join(root, "index.html"),
      '<html><body><main></main><script type="module" src="/entry.ts"></script></body></html>',
    );
    await writeFile(
      join(root, "entry.ts"),
      `
      import routes from "virtual:smolter/routes";
      import { label } from "./label.ts";
      const main = document.querySelector("main");
      main.textContent = routes.map(route => route.path).join(",") + " " + label;
      import.meta.hot.accept("./label.ts", (module) => {
        main.textContent = routes.map(route => route.path).join(",") + " " + module.label;
      });
    `,
    );
    await writeFile(join(root, "label.ts"), 'export const label = "Before";');

    const server = await createServer({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        fileRouter(
          manual
            ? { clientRoutes: "routes.ts", serverRoutes: "routes.ts" }
            : {},
        ),
      ],
      server: {
        port: 0,
        host: "127.0.0.1",
        watch: { usePolling: true, interval: 150 },
      },
    });
    cleanups.push(() => server.close());
    await server.listen();
    await page.goto(server.resolvedUrls!.local[0]);
    await expect(page.locator("main")).toHaveText("/ Before");

    // An accepted ordinary module edit must update without replacing the document.
    await page.evaluate(() => {
      document.body.dataset.marker = "retained";
    });
    await writeFile(join(root, "label.ts"), 'export const label = "After";');
    await expect(page.locator("main")).toHaveText("/ After");
    await expect(page.locator("body")).toHaveAttribute(
      "data-marker",
      "retained",
    );

    if (manual)
      await writeFile(
        join(root, "routes.ts"),
        'export const routes = [{ path: "/" }, { path: "/added" }];',
      );
    if (!manual)
      await writeFile(
        join(root, "src/routes/added.ts"),
        'export default function Added() { return "Added"; }',
      );
    await expect(page.locator("main")).toHaveText("/,/added After");

    if (manual)
      await writeFile(
        join(root, "routes.ts"),
        'export const routes = [{ path: "/" }];',
      );
    if (!manual) await rm(join(root, "src/routes/added.ts"));
    await expect(page.locator("main")).toHaveText("/ After");
  });
}
