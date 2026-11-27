import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RouteDiscoveryManifest } from "@smolter/server";
import { build, type Rolldown } from "vite";
import { expect, it, type TestContext } from "vitest";
import { lazyFiles } from "../src/application/lazy-files.ts";
import { applicationPlugins } from "../src/application/vite.ts";
import { deploymentPlugin } from "../src/deployment.ts";
import { fileRouter } from "../src/index.ts";

type Output = (Rolldown.OutputChunk | Rolldown.OutputAsset)[];

const files = {
  "entry.ts":
    'import deployment from "virtual:smolter/deployment"; import routes, { discover } from "virtual:smolter/routes"; console.log(deployment, routes, discover);',
  "admin.css": ".admin-panel { color: rebeccapurple; }",
  "server.ts": "export const loader = () => 1;",
  "src/routes/_index.ts":
    'export default function Home() { return "Public home"; }',
  "src/routes/admin.ts": `
    import "../../admin.css";
    export { loader } from "../../server.ts";
    export function meta() { return [{ title: "Admin" }]; }
    export default function Admin() { return "SECRET_ADMIN_VIEW"; }
  `,
  "src/routes/admin.users.$id.ts":
    'export default function User() { return "SECRET_USER_VIEW"; }',
};

async function fixture(
  context: TestContext,
  sources: Record<string, string> = files,
) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "smolter-route-discovery-")),
  );
  context.onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "src/routes"), { recursive: true });
  await Promise.all(
    Object.entries(sources).map(([name, source]) =>
      writeFile(join(root, name), source),
    ),
  );
  return root;
}

it.for(["react", "preact"] as const)(
  "%s withholds protected routes from public output and records them privately",
  async (framework, context) => {
    const root = await fixture(context);
    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      base: "/app/",
      plugins: [
        lazyFiles("src/routes", undefined, framework, {
          protect: (route) => route.path.startsWith("/admin"),
          manifestFile: "server/route-discovery.json",
        }),
        fileRouter({ framework }),
        deploymentPlugin(),
      ],
      build: {
        outDir: "client",
        minify: true,
        rollupOptions: {
          input: join(root, "entry.ts"),
          external: [new RegExp(`^@kasperrt/smolter/${framework}/`)],
        },
      },
    });
    if (!("output" in result)) throw new Error("Expected build output");
    const output: Output = result.output;
    const manifest: RouteDiscoveryManifest = JSON.parse(
      await readFile(join(root, "server/route-discovery.json"), "utf8"),
    );
    const withheld = manifest.routes.filter((route) => route.route);
    expect(withheld.map((route) => route.path)).toEqual([
      "/admin/users/:id",
      "/admin",
    ]);
    expect(manifest.routes.map((route) => route.path)).toContain("/");
    const admin = withheld.find((route) => route.path === "/admin")!.route!;
    expect(admin.capabilities).toEqual({ loader: true, meta: true });
    expect(admin.exports).toEqual(["default", "meta"]);
    expect(admin.file).toMatch(/^\/app\/assets\/route-[\w-]+\.js$/);
    expect(admin.styles).toHaveLength(1);
    const adminChunk = output.find(
      (item) => `/app/${item.fileName}` === admin.file,
    );
    expect(adminChunk?.type).toBe("chunk");
    if (adminChunk?.type !== "chunk") return;
    expect(adminChunk.code).toContain("SECRET_ADMIN_VIEW");
    expect(adminChunk.exports).toEqual(
      expect.arrayContaining(["default", "meta"]),
    );
    // Everything an anonymous client loads or can enumerate stays free of withheld routes.
    const entry = output.find(
      (item): item is Rolldown.OutputChunk =>
        item.type === "chunk" &&
        item.isEntry &&
        !withheld.some(
          (route) => route.route!.file === `/app/${item.fileName}`,
        ),
    )!;
    const reachable = new Set<string>();
    const visit = (fileName: string) => {
      const chunk = output.find((item) => item.fileName === fileName);
      if (chunk?.type !== "chunk" || reachable.has(fileName)) return;
      reachable.add(fileName);
      for (const imported of [...chunk.imports, ...chunk.dynamicImports])
        visit(imported);
    };
    visit(entry.fileName);
    const publicText = [
      ...[...reachable].map(
        (fileName) =>
          (
            output.find(
              (item) => item.fileName === fileName,
            ) as Rolldown.OutputChunk
          ).code,
      ),
      ...output
        .filter(
          (item) => item.type === "asset" && item.fileName.endsWith(".json"),
        )
        .map((item) => String((item as Rolldown.OutputAsset).source)),
    ].join("\n");
    expect(publicText).toContain("Public home");
    expect(publicText).not.toMatch(/admin|SECRET_|users/i);
    expect(publicText).not.toContain(admin.file.replace("/app/", ""));
    expect(publicText).toContain(manifest.build);
    expect(publicText).not.toContain("__SMOLTER_ROUTE_BUILD___");
  },
);

it.for(["react", "preact"] as const)(
  "%s withholds protected flat routes behind lazyRoute discovery",
  async (framework, context) => {
    const { "src/routes/admin.users.$id.ts": _nested, ...flat } = files;
    const root = await fixture(context, flat);
    const result = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        lazyFiles("src/routes", undefined, framework, {
          protect: (route) => route.path === "/admin",
          manifestFile: "private/routes.json",
        }),
        fileRouter({ framework }),
        deploymentPlugin(),
      ],
      build: {
        outDir: "client",
        rollupOptions: {
          input: join(root, "entry.ts"),
          external: [new RegExp(`^@kasperrt/smolter/${framework}/`)],
        },
      },
    });
    if (!("output" in result)) throw new Error("Expected build output");
    const manifest: RouteDiscoveryManifest = JSON.parse(
      await readFile(join(root, "private/routes.json"), "utf8"),
    );
    expect(manifest.nested).toBe(false);
    expect(manifest.routes).toHaveLength(2);
    expect(manifest.routes).toEqual(
      expect.arrayContaining([
        { path: "/admin", route: expect.objectContaining({ path: "/admin" }) },
        { path: "/" },
      ]),
    );
    const entry = result.output.find(
      (item): item is Rolldown.OutputChunk =>
        item.type === "chunk" && item.fileName.includes("entry"),
    )!;
    expect(entry.code).toContain(`@kasperrt/smolter/${framework}/lazy-route`);
    expect(entry.code).toContain(manifest.build);
    expect(entry.code).not.toMatch(/admin/i);
  },
);

it("refuses a discovery manifest inside client output", async (context) => {
  const root = await fixture(context);
  await expect(
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        lazyFiles("src/routes", undefined, "preact", {
          protect: () => true,
          manifestFile: "dist/route-discovery.json",
        }),
        fileRouter({ framework: "preact" }),
      ],
      build: {
        rollupOptions: {
          input: join(root, "entry.ts"),
          external: [/^@kasperrt\/smolter\//],
        },
      },
    }),
  ).rejects.toThrow(
    "routeDiscovery.manifestFile must be outside client output",
  );
});

it("requires split routes for route discovery", () => {
  expect(() =>
    applicationPlugins({
      splitRoutes: false,
      routeDiscovery: { protect: () => true, manifestFile: "private.json" },
    }),
  ).toThrow("routeDiscovery requires splitRoutes");
});
