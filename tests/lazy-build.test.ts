import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { expect, it } from "vitest";
import { lazyFiles } from "../packages/vite/src/application/lazy-files.ts";
import { fileRouter } from "../packages/vite/src/index.ts";

interface RouteAssets {
  path: string;
  files: string[];
}

it("splits route views and records their shared assets without bundling server handlers", async (context) => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "smolter-lazy-build-")),
  );

  context.onTestFinished(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, "src/routes"), { recursive: true });

  const files = {
    "entry.ts": 'export { default } from "virtual:smolter/routes";',
    "shared.ts": 'export const label = "Shared route content";',
    "server.ts":
      'import { readFile } from "node:fs/promises"; export const loader = () => readFile("SERVER_ONLY");',
    "src/routes/_index.ts": `
      import { label } from "../../shared.ts";
      export { loader } from "../../server.ts";
      export const id = "home";
      export function clientLoader() { return label; }
      export default function Home() { return label; }
    `,
    "src/routes/other.ts": `
      import { label } from "../../shared.ts";
      export const routePath = "/renamed";
      export const handle = { title: "Other" };
      export default function Other() { return label; }
    `,
    "src/routes/data.ts": 'export { loader } from "../../server.ts";',
  };

  await Promise.all(
    Object.entries(files).map(([name, source]) =>
      writeFile(join(root, name), source),
    ),
  );

  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [lazyFiles("src/routes"), fileRouter({ framework: "preact" })],
    build: {
      write: false,
      minify: true,
      rollupOptions: {
        input: join(root, "entry.ts"),
        external: ["@kasperrt/smolter/preact/lazy-route"],
      },
    },
  });

  expect(result).toHaveProperty("output");

  if (!("output" in result)) return;

  const chunks = result.output.filter((item) => item.type === "chunk");
  const manifest = result.output.find(
    (item) => item.fileName === ".vite/route-assets.json",
  );

  expect(manifest?.type).toBe("asset");

  if (manifest?.type !== "asset") return;

  const routes: RouteAssets[] = JSON.parse(String(manifest.source));

  expect(routes.map((route) => route.path)).toEqual(["/", "/renamed"]);

  for (const route of routes) {
    expect(route.files.length).toBeGreaterThan(1);
    expect(
      route.files.every((file) =>
        chunks.some((chunk) => chunk.fileName === file),
      ),
    ).toBe(true);
  }

  const shared = routes[0].files.filter((file) =>
    routes[1].files.includes(file),
  );
  const entry = chunks.find((chunk) => chunk.isEntry);

  expect(shared).toHaveLength(1);
  expect(entry?.dynamicImports).toHaveLength(3);
  expect(entry?.code).toMatch(/id:[`"]home[`"]/);
  expect(chunks.map((chunk) => chunk.code).join("\n")).not.toMatch(
    /SERVER_ONLY|node:fs/,
  );
});
