import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, createServer } from "vite";
import { expect, it, type TestContext } from "vitest";
import { applicationPlugins } from "../src/application/vite.ts";
import { deploymentPlugin } from "../src/deployment.ts";
import { namespaceConfig } from "../src/namespace.ts";

const identifiers =
  /\.__smolter|X-Smolter-Redirect|smolter-data|__smolter(?:Pending|Rejected|Undefined|Literal|Deferred)|data-smolter-|smolter-manifest|smolter:deployment|:smolter/i;

async function fixture(context: TestContext) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "smolter-namespace-")),
  );
  context.onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "src/routes"), { recursive: true });
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  await writeFile(
    join(root, "src/routes/_index.ts"),
    'export { loader } from "../../loader.ts"; export default function Home() { return null; }',
  );
  await writeFile(
    join(root, "src/routes/login.ts"),
    'export { loader } from "../../redirect.ts"; export default function Login() { return null; }',
  );
  await writeFile(
    join(root, "loader.ts"),
    "export function loader() { return { ready: true, later: Promise.resolve(1) }; }",
  );
  await writeFile(
    join(root, "redirect.ts"),
    'export function loader() { return new Response(null, { status: 302, headers: { Location: "/" } }); }',
  );
  return root;
}

const sources = Object.entries({
  "preact/server": "server/src/preact.ts",
  "preact/client": "preact/src/client.tsx",
  "preact/document": "preact/src/document.tsx",
  "preact/lazy-route": "preact/src/lazy-route.ts",
  preact: "preact/src/index.ts",
}).map(([name, file]) => ({
  find: new RegExp(`^@kasperrt/smolter/${name}$`),
  replacement: resolve("packages", file),
}));

it("rejects namespaces and manifest names that cannot form safe identifiers", async () => {
  for (const namespace of ["", "App", "1app", "a-b", 'x"y', "a".repeat(33)])
    expect(() => namespaceConfig(namespace)).toThrow(
      "namespace must start with a lowercase letter",
    );
  for (const options of [
    { manifestFile: "../manifest.json" },
    { manifestFile: "assets/manifest.json" },
    { manifestFile: "manifest.js" },
    { define: { __SMOLTER_NAMESPACE__: '"</script>"' } },
  ])
    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        define: "define" in options ? options.define : {},
        plugins: [deploymentPlugin("manifestFile" in options ? options : {})],
        build: {
          write: false,
          rollupOptions: { input: "virtual:smolter/deployment" },
        },
      }),
    ).rejects.toThrow(/manifestFile must be|namespace must start/);
});

it("emits a custom deployment manifest name at the configured URL", async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    base: "/assets/",
    plugins: [
      {
        name: "entry",
        resolveId: (id) => (id === "entry" ? "\0entry" : undefined),
        load: (id) =>
          id === "\0entry"
            ? 'import deployment from "virtual:smolter/deployment"; console.log(deployment);'
            : undefined,
      },
      deploymentPlugin({ manifestFile: "build-info.json", namespace: "app" }),
    ],
    build: { write: false, minify: false, rollupOptions: { input: "entry" } },
  });
  if (!("output" in result)) throw new Error("Expected build output");
  expect(result.output.map((item) => item.fileName)).toContain(
    "build-info.json",
  );
  const code = result.output
    .map((item) => (item.type === "chunk" ? item.code : ""))
    .join("\n");
  expect(code).toContain("/assets/build-info.json");
  expect(code).not.toMatch(/smolter/i);
});

it("serves SSR documents, deferred data and transport under a custom namespace", async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, "src/entry.server.tsx"),
    `
    import routes from "virtual:smolter/routes";
    import { h } from "preact";
    import { Outlet } from "@kasperrt/smolter/preact";
    import { Document, Scripts } from "@kasperrt/smolter/preact/document";
    import { renderApplication } from "@kasperrt/smolter/preact/server";
    const root = {
      default: Outlet,
      Layout: ({ children }) => h(Document, null, h("head", null), h("body", null, children, h(Scripts, null))),
    };
    export default function render(request, entry) {
      return renderApplication(request, routes, root, entry, { earlyHydration: true });
    }
  `,
  );
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    resolve: { alias: sources },
    plugins: applicationPlugins({ framework: "preact", namespace: "app" }),
    server: { port: 0 },
  });
  context.onTestFinished(() => server.close());
  await server.listen();
  const origin = server.resolvedUrls!.local[0];
  const html = await (
    await fetch(origin, { headers: { Accept: "text/html" } })
  ).text();
  expect(html).toContain('id="app-data"');
  expect(html).toContain("window.__appDeferred");
  expect(html).toContain("__appPending");
  expect(html).not.toMatch(identifiers);
  const data = await fetch(new URL("/.__app", origin));
  expect(data.status).toBe(200);
  expect(await data.json()).toEqual({ ready: true, later: 1 });
  const redirect = await fetch(new URL("/login.__app", origin));
  expect(redirect.headers.get("X-app-Redirect")).toBe("/");
  expect([...redirect.headers.keys()].join()).not.toMatch(identifiers);
  const legacy = await fetch(new URL("/.__smolter", origin), {
    headers: { Accept: "application/json" },
  });
  expect(legacy.headers.get("Content-Type") ?? "").not.toContain(
    "application/json",
  );
});

it("builds browser output and the deployment manifest without default identifiers", async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>',
  );
  await writeFile(
    join(root, "main.ts"),
    `
    import routes from "virtual:smolter/routes";
    import deployment from "virtual:smolter/deployment";
    import { mountApplication } from "@kasperrt/smolter/preact/client";
    await mountApplication(routes, undefined, { deployment });
  `,
  );
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    resolve: { alias: sources },
    plugins: [
      ...applicationPlugins({
        framework: "preact",
        namespace: "app",
        ssr: false,
      }),
      deploymentPlugin(),
    ],
    build: { write: false },
  });
  if (!("output" in result)) throw new Error("Expected build output");
  const names = result.output.map((item) => item.fileName);
  expect(names).toContain("app-manifest.json");
  const code = result.output
    .map((item) => (item.type === "chunk" ? item.code : String(item.source)))
    .join("\n");
  expect(code).toMatch(/[`"']app[`"']/);
  expect(code).toContain("/app-manifest.json");
  // The browser output carries no Smolter identifier at all, only the namespace.
  expect(code).not.toMatch(/smolter/i);
  expect(names.join()).not.toMatch(/smolter/i);
});
