import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { viteFixture } from "./helpers/vite";

interface RoutePath {
  path: string;
}

it("refreshes server transport when route handler exports change", async (context) => {
  const view = "export default function View() { return null; }\n";
  const { route, server } = await viteFixture(context, view);

  const source = async () =>
    (await server.transformRequest("virtual:smolter/routes"))?.code ?? "";

  expect(await source()).not.toContain("serverRoute(");

  await writeFile(
    route,
    `${view}export { loader, action } from "../../handlers.ts";\n`,
  );

  await expect.poll(source, { timeout: 3000 }).toContain("serverRoute(");

  await writeFile(route, view);

  await expect.poll(source, { timeout: 3000 }).not.toContain("serverRoute(");
});

it.for(["react", "preact"] as const)(
  "updates %s browser and SSR discovery when flat routes are added, renamed and removed",
  async (framework, context) => {
    const { root, server } = await viteFixture(
      context,
      "export default function Home() { return null; }",
      { framework },
    );
    const browser = async () =>
      (await server.transformRequest("virtual:smolter/routes"))?.code ?? "";
    const paths = async () =>
      (await server.ssrLoadModule("virtual:smolter/routes")).default.map(
        (route: RoutePath) => route.path,
      );

    expect(await browser()).not.toContain("/added");
    expect(await paths()).toEqual(["/"]);

    const directory = join(root, "src/routes/added");
    await mkdir(directory);
    await writeFile(
      join(directory, "route.ts"),
      "export default function Added() { return null; }",
    );

    await expect.poll(browser).toContain("/added");
    await expect.poll(paths).toContain("/added");

    await rename(directory, join(root, "src/routes/renamed"));

    await expect.poll(browser).toContain("/renamed");
    await expect.poll(paths).toEqual(["/", "/renamed"]);

    await rm(join(root, "src/routes/renamed"), { recursive: true });

    await expect.poll(browser).not.toContain("/renamed");
    await expect.poll(paths).toEqual(["/"]);
  },
);

it("leaves colocated components and helpers to Vite HMR", async (context) => {
  const { root, server } = await viteFixture(
    context,
    "export default function Home() { return null; }",
  );
  const send = vi.spyOn(server.ws, "send");

  await server.transformRequest("virtual:smolter/routes");

  server.watcher.emit(
    "change",
    join(root, "src/routes/account/components/Title.tsx"),
  );
  server.watcher.emit("change", join(root, "src/routes/account/loader.ts"));
  server.watcher.emit("add", join(root, "src/routes/types.d.ts"));
  server.watcher.emit("change", join(root, "src/unrelated.ts"));

  expect(send).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "full-reload" }),
  );
});

it("updates manually defined route arrays through the Vite import graph", async (context) => {
  const { root, server } = await viteFixture(
    context,
    "export default function Home() { return null; }",
    {
      clientRoutes: "client-routes.ts",
      serverRoutes: "server-routes.ts",
    },
  );
  const client = join(root, "client-routes.ts");
  const backend = join(root, "server-routes.ts");
  await writeFile(client, 'export const routes = [{ path: "/" }];');
  await writeFile(backend, 'export const routes = [{ path: "/" }];');
  const browser = async () =>
    (await server.transformRequest("/client-routes.ts"))?.code ?? "";
  const paths = async () =>
    (await server.ssrLoadModule("virtual:smolter/routes")).default.map(
      (route: RoutePath) => route.path,
    );

  await server.transformRequest("virtual:smolter/routes");
  expect(await browser()).not.toContain("/added");
  expect(await paths()).toEqual(["/"]);

  await writeFile(
    client,
    'export const routes = [{ path: "/" }, { path: "/added" }];',
  );
  await writeFile(
    backend,
    'export const routes = [{ path: "/" }, { path: "/added" }];',
  );

  await expect.poll(browser).toContain("/added");
  await expect.poll(paths).toContain("/added");

  await writeFile(client, 'export const routes = [{ path: "/" }];');
  await writeFile(backend, 'export const routes = [{ path: "/" }];');

  await expect.poll(browser).not.toContain("/added");
  await expect.poll(paths).toEqual(["/"]);
  server.watcher.emit("change", join(root, "src/routes/_index.ts"));
});
