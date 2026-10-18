import { build, type Plugin } from "vite";
import { expect, it } from "vitest";
import { browserBoundary } from "../packages/vite/src/application/browser-boundary.ts";

interface FixtureOptions {
  moduleId?: string;
  moduleSource?: string;
  ssr?: boolean;
}

function buildFixture(source: string, options: FixtureOptions = {}) {
  const entry = "\0smolter-boundary-entry";
  const moduleId = options.moduleId ?? "\0safe-dependency";
  const fixture: Plugin = {
    name: "boundary-fixture",
    enforce: "pre",
    resolveId(id) {
      if (id === entry || id === "fixture")
        return id === entry ? entry : moduleId;
    },
    load(id) {
      if (id === entry) return source;
      if (id === moduleId)
        return options.moduleSource ?? "export const value = 42;";
    },
  };
  return build({
    configFile: false,
    logLevel: "silent",
    plugins: [fixture, browserBoundary()],
    build: {
      write: false,
      ssr: options.ssr,
      rollupOptions: {
        input: entry,
        external: ["node:fs"],
        preserveEntrySignatures: "strict",
      },
    },
  });
}

it.each(["server", "vite", "files"])(
  "rejects emitted Smolter %s code in the browser",
  async (name) => {
    await expect(
      buildFixture('export { value } from "fixture";', {
        moduleId: `\0/fixture/node_modules/@kasperrt/smolter/dist/${name}/index.js`,
      }),
    ).rejects.toThrow("Unexpected browser module");
  },
);

it("allows a server import when tree shaking removes it entirely", async () => {
  await expect(
    buildFixture('import { value } from "fixture"; export const client = 1;', {
      moduleId:
        "\0/fixture/node_modules/@kasperrt/smolter/dist/server/index.js",
    }),
  ).resolves.toBeDefined();
});

it.each([
  'export { readFile } from "node:fs";',
  'export const load = () => import("node:fs");',
])("rejects Node imports in browser output: %s", async (source) => {
  await expect(buildFixture(source)).rejects.toThrow(
    "Node builtin in browser chunk",
  );
});

it("allows Node imports in server builds", async () => {
  await expect(
    buildFixture('export { readFile } from "node:fs";', {
      ssr: true,
    }),
  ).resolves.toBeDefined();
});

it.each([
  "/repo/smolter/packages/server/src/index.ts",
  "/repo/smolter/packages/vite/src/index.ts",
  "/fixture/node_modules/@kasperrt/smolter/dist/internal/server/index.js",
  "/fixture/node_modules/react/index.js",
  "/fixture/src/session.server.ts",
  "__vite-browser-external:fs",
  "C:\\fixture\\node_modules\\react-dom\\index.js",
])("rejects emitted browser-incompatible modules: %s", async (moduleId) => {
  await expect(
    buildFixture('export { value } from "fixture";', {
      moduleId: `\0${moduleId}`,
    }),
  ).rejects.toThrow("Unexpected browser module");
});
