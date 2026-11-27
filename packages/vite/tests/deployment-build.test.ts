import { build, createServer, type Plugin } from "vite";
import { expect, it } from "vitest";
import { deploymentPlugin } from "../src/deployment.ts";

const entry: Plugin = {
  name: "deployment-test-entry",
  resolveId(id) {
    if (id === "entry") return "\0entry";
  },
  load(id) {
    if (id === "\0entry")
      return 'import deployment from "virtual:smolter/deployment"; console.log(deployment);';
  },
};

async function compile(ssr = false, manifestURL?: string) {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    base: "/app/",
    plugins: [entry, deploymentPlugin({ manifestURL })],
    build: {
      ssr,
      write: false,
      minify: false,
      rollupOptions: { input: "entry" },
    },
  });
  if (!("output" in result)) throw new Error("Expected build output");
  const file = result.output.find(
    (item) => item.fileName === "smolter-manifest.json",
  );
  const code = result.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  return { file, code };
}

it("emits a deterministic build identity matching the browser module and respects the base URL", async () => {
  const first = await compile();
  const second = await compile(false, "https://assets.test/current.json");
  expect(first.file?.type).toBe("asset");
  expect(second.file?.type).toBe("asset");
  if (first.file?.type !== "asset" || second.file?.type !== "asset") return;
  const before = JSON.parse(String(first.file.source));
  const after = JSON.parse(String(second.file.source));
  expect(before.version).toBe(after.version);
  expect(first.code).toContain(before.version);
  expect(first.code).toContain("/app/smolter-manifest.json");
  expect(second.code).toContain("https://assets.test/current.json");
});

it("does not emit or poll deployments during SSR or development", async (context) => {
  const serverBuild = await compile(true);
  expect(serverBuild.file).toBeUndefined();
  expect(serverBuild.code).toContain("null");
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [deploymentPlugin()],
  });
  context.onTestFinished(() => server.close());
  const module = await server.transformRequest("virtual:smolter/deployment");
  expect(module?.code).toContain("export default null");
});

it("fingerprints shared and per-route dependencies independently in production output", async () => {
  const compileRoutes = async (
    change: "none" | "route" | "shared" | "style" | "contract",
  ) => {
    const fixture: Plugin = {
      name: "deployment-route-fixture",
      resolveId(id) {
        if (
          [
            "entry",
            "a",
            "b",
            "shared",
            "style",
            "virtual:smolter/routes",
          ].includes(id)
        )
          return `\0${id}`;
      },
      load(id) {
        if (id === "\0entry")
          return 'import deployment from "virtual:smolter/deployment"; import routes from "virtual:smolter/routes"; import shared from "shared"; console.log(deployment, routes, shared);';
        if (id === "\0virtual:smolter/routes")
          return {
            code: 'export default [() => import("a"), () => import("b")];',
            meta: {
              smolterRoutes: [
                { path: "/a", id: "\0a" },
                { path: "/b", id: "\0b" },
              ],
            },
          };
        if (id === "\0a")
          return 'import style from "style"; export default "a" + style;';
        if (id === "\0b")
          return `export default ${JSON.stringify(change === "route" ? "changed" : "b")};`;
        if (id === "\0shared")
          return `export default ${JSON.stringify(change === "shared" ? "changed" : "shell")};`;
        if (id === "\0style")
          return `export default ${JSON.stringify(change === "style" ? "changed" : "style")};`;
      },
    };
    const result = await build({
      configFile: false,
      logLevel: "silent",
      plugins: [
        fixture,
        deploymentPlugin({
          compatibility: change === "contract" ? "v2" : "v1",
        }),
      ],
      build: { write: false, rollupOptions: { input: "entry" } },
    });
    if (!("output" in result)) throw new Error("Missing output");
    const file = result.output.find(
      (item) => item.fileName === "smolter-manifest.json",
    );
    if (file?.type !== "asset") throw new Error("Missing manifest");
    const manifest = JSON.parse(String(file.source));
    expect(
      result.output
        .filter((item) => item.type === "chunk")
        .map((item) => item.code)
        .join("\n"),
    ).toContain(manifest.version);
    return manifest;
  };
  const before = await compileRoutes("none");
  expect(await compileRoutes("none")).toEqual(before);
  const route = await compileRoutes("route");
  expect(route.version).not.toBe(before.version);
  expect(route.shared).toBe(before.shared);
  expect(route.routes[0]).toEqual(before.routes[0]);
  expect(route.routes[1]).not.toEqual(before.routes[1]);
  const shared = await compileRoutes("shared");
  expect(shared.shared).not.toBe(before.shared);
  const style = await compileRoutes("style");
  expect(style.shared).toBe(before.shared);
  expect(style.routes[0]).not.toEqual(before.routes[0]);
  expect(style.routes[1]).toEqual(before.routes[1]);
  const contract = await compileRoutes("contract");
  expect(contract.shared).not.toBe(before.shared);
});

it("keeps route templates private in version-only mode and refreshes the private build file", async (context) => {
  const { access, mkdir, mkdtemp, readFile, rm, symlink } = await import(
    "node:fs/promises"
  );
  const { tmpdir } = await import("node:os");
  const { resolve } = await import("node:path");
  const root = await mkdtemp(resolve(tmpdir(), "smolter-private-manifest-"));
  context.onTestFinished(() => rm(root, { recursive: true, force: true }));
  const fixture: Plugin = {
    name: "private-route-metadata",
    resolveId: (id) =>
      id === "virtual:smolter/routes" ? `\0${id}` : undefined,
    load(id) {
      if (id === "\0entry")
        return 'import "virtual:smolter/routes"; import deployment from "virtual:smolter/deployment"; console.log(deployment);';
      if (id === "\0virtual:smolter/routes")
        return {
          code: 'console.log("route metadata");',
          meta: {
            smolterRoutes: [{ path: "/admin", id: "\0virtual:smolter/routes" }],
          },
        };
    },
  };
  const compilePrivate = async (privateManifestFile: string, write = true) =>
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [
        fixture,
        entry,
        deploymentPlugin({
          manifestMode: "version-only",
          privateManifestFile,
          manifestFile: "__appm",
        }),
      ],
      build: { outDir: "client", write, rollupOptions: { input: "entry" } },
    });
  const result = await compilePrivate("private/routes.json");
  if (!("output" in result)) throw new Error("Missing output");
  const publicManifest = JSON.parse(
    await readFile(resolve(root, "client/__appm"), "utf8"),
  );
  expect(Object.keys(publicManifest)).toEqual(["version"]);
  const code = result.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
  expect(code).toContain(publicManifest.version);
  expect(code).not.toMatch(/\/admin|fingerprint|shared/);
  expect(
    JSON.parse(await readFile(resolve(root, "private/routes.json"), "utf8")),
  ).toEqual({ version: publicManifest.version, routes: ["/admin"] });
  await compilePrivate("private/routes.json");
  await expect(compilePrivate("client/private.json")).rejects.toThrow(
    "outside client output",
  );
  await expect(compilePrivate("public/private.json")).rejects.toThrow(
    "outside client output",
  );
  await compilePrivate("unwritten/routes.json", false);
  await expect(
    readFile(resolve(root, "unwritten/routes.json")),
  ).rejects.toThrow();
  await mkdir(resolve(root, "public"), { recursive: true });
  await symlink(resolve(root, "public"), resolve(root, "linked"));
  await expect(compilePrivate("linked/routes.json")).rejects.toThrow(
    "resolves inside a public directory",
  );
  await expect(compilePrivate("linked/nested/routes.json")).rejects.toThrow(
    "resolves inside a public directory",
  );
  await expect(access(resolve(root, "public/nested"))).rejects.toThrow();
});
