import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build, type InlineConfig } from "vite";
import { expect, it, type TestContext } from "vitest";
import {
  type PrerenderOptions,
  prerenderPlugin,
  renderPaths,
} from "../src/prerender.ts";

async function fixture(context: TestContext) {
  const root = await mkdtemp(resolve(tmpdir(), "smolter-prerender-"));
  context.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "src/routes"), { recursive: true });
  await mkdir(resolve(root, "dist/client"), { recursive: true });
  await writeFile(resolve(root, "package.json"), '{"type":"module"}');
  for (const name of ["_index", "about", "preview", "posts.$slug"])
    await writeFile(
      resolve(root, `src/routes/${name}.ts`),
      "export default null;",
    );
  await writeFile(
    resolve(root, "src/entry.client.tsx"),
    'console.log("client");',
  );
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    `export default (request, entry) => new Response('<!doctype html><h1>' + new URL(request.url).pathname + '</h1><script type="module" src="' + entry + '"></script>', { headers: { 'Content-Type': 'text/html' } });`,
  );
  return root;
}

function config(
  root: string,
  ssr: boolean,
  options: Partial<PrerenderOptions> = {},
): InlineConfig {
  return {
    root,
    configFile: false,
    logLevel: "silent",
    base: "/site/",
    plugins: [prerenderPlugin({ paths: (paths) => paths, ...options })],
    build: {
      outDir: ssr ? "dist/server" : "dist/client",
      ...(ssr && { ssr: "src/entry.server.ts" }),
      rollupOptions: {
        input: ssr ? "src/entry.server.ts" : "src/entry.client.tsx",
      },
    },
  };
}

it("builds the client then prerenders filtered static and added dynamic paths in a worker", async (context) => {
  const root = await fixture(context);
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    `setInterval(() => {}, 1000); export default (request, entry) => new Response('<h1>' + new URL(request.url).pathname + '</h1><script src="' + entry + '"></script>', { headers: { 'Content-Type': 'text/html' } });`,
  );
  await build(config(root, false));
  await build(
    config(root, true, {
      paths: async (paths) => [
        ...paths.filter((path) => path !== "/preview"),
        "/posts/published",
        "/posts/published",
      ],
    }),
  );
  expect(
    await readFile(resolve(root, "dist/client/index.html"), "utf8"),
  ).toContain("<h1>/site/</h1>");
  const html = await readFile(
    resolve(root, "dist/client/posts/published/index.html"),
    "utf8",
  );
  expect(html).toContain("/site/posts/published");
  expect(html).toMatch(/src="\/site\/assets\/entry.client-[^" ]+\.js"/);
  await expect(
    readFile(resolve(root, "dist/client/preview/index.html")),
  ).rejects.toThrow();
});

it("renders HTML, skips redirects and resources, and reports per-path errors", async (context) => {
  const root = await fixture(context);
  const serverEntry = resolve(root, "render.ts");
  await writeFile(
    serverEntry,
    `export default (request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === '/redirect') return Response.redirect('https://example.com');
    if (path === '/resource') return Response.json({ ok: true });
    if (path === '/failed') return new Response('failed', { status: 500 });
    if (path === '/throw') throw new Error('render exploded');
    return new Response('<h1>ready</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };`,
  );
  const options = {
    serverEntry,
    clientEntry: "/entry.js",
    outDir: resolve(root, "dist/client"),
    origin: "https://example.com",
    base: "/",
    paths: ["/", "/redirect", "/resource"],
  };
  await renderPaths(options);
  expect(
    await readFile(resolve(options.outDir, "index.html"), "utf8"),
  ).toContain("ready");
  await expect(
    readFile(resolve(options.outDir, "redirect/index.html")),
  ).rejects.toThrow();
  for (const path of [
    "/failed",
    "/throw",
    "../escape",
    "//host",
    "/a?b",
    "/%2e%2e/escape",
    "/a%2fb",
    "/a%7fb",
    "/%zz",
  ])
    await expect(renderPaths({ ...options, paths: [path] })).rejects.toThrow(
      `Prerender failed for ${path}`,
    );
  await expect(
    renderPaths({ ...options, base: "//evil.example", paths: ["/"] }),
  ).rejects.toThrow("Unsafe output pathname");
  await mkdir(resolve(root, "outside"));
  await symlink(resolve(root, "outside"), resolve(options.outDir, "escape"));
  await expect(
    renderPaths({ ...options, paths: ["/escape/nested"] }),
  ).rejects.toThrow("escapes client output");
  await symlink(
    resolve(root, "outside/file"),
    resolve(options.outDir, "linked"),
  );
  await mkdir(resolve(options.outDir, "linked-file"));
  await symlink(
    resolve(root, "outside/file"),
    resolve(options.outDir, "linked-file/index.html"),
  );
  await expect(
    renderPaths({ ...options, paths: ["/linked-file"] }),
  ).rejects.toThrow("Prerender failed for /linked-file");
});

it("propagates worker errors and bounds modules that never finish rendering", async (context) => {
  const root = await fixture(context);
  await build(config(root, false));
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    'export default () => { throw new Error("broken render"); };',
  );
  await expect(build(config(root, true))).rejects.toThrow(
    /Prerender failed for .*broken render/,
  );
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    "export default () => new Promise(() => { setInterval(() => {}, 100); });",
  );
  await expect(build(config(root, true, { timeout: 500 }))).rejects.toThrow(
    "Prerender timed out",
  );
  await writeFile(
    resolve(root, "src/entry.server.ts"),
    "export default () => process.exit(0);",
  );
  await expect(build(config(root, true))).rejects.toThrow(
    "exited before completion",
  );
});

it("rejects invalid setup and leaves unwritten builds alone", async (context) => {
  const root = await fixture(context);
  await build(config(root, false));
  await expect(
    build(config(root, true, { clientEntry: "missing" })),
  ).rejects.toThrow("client entry is missing");
  await expect(
    build(config(root, true, { clientEntry: "toString" })),
  ).rejects.toThrow("client entry is missing");
  for (const origin of [
    "javascript:alert(1)",
    "not-a-url",
    "https://user:pass@example.com",
    "https://example.com/path",
  ])
    await expect(build(config(root, true, { origin }))).rejects.toThrow(
      "Prerender origin must be an http or https origin",
    );
  await expect(build(config(root, true, { timeout: 0 }))).rejects.toThrow(
    "timeout must be positive",
  );
  await expect(build({ ...config(root, true), base: "./" })).rejects.toThrow(
    "absolute Vite base",
  );
  await expect(
    build(config(root, true, { directory: "missing" })),
  ).rejects.toThrow();
  await build({
    ...config(root, true),
    build: { ...config(root, true).build, write: false },
  });
  await expect(
    build({
      ...config(root, true),
      build: {
        ...config(root, true).build,
        ssr: true,
        rollupOptions: {
          input: ["src/entry.server.ts", "src/entry.client.tsx"],
        },
      },
    }),
  ).rejects.toThrow("exactly one SSR entry");
});

it("uses asset-host entry URLs and selected paths without route discovery", async (context) => {
  const root = await fixture(context);
  await rm(resolve(root, "src/routes"), { recursive: true });
  const base = "https://cdn.example.com/site/";
  await build({ ...config(root, false), base });
  await build({
    ...config(root, true, {
      paths: ["/selected"],
      origin: "https://example.com",
    }),
    base,
  });
  const html = await readFile(
    resolve(root, "dist/client/selected/index.html"),
    "utf8",
  );
  expect(html).toContain("<h1>/site/selected</h1>");
  expect(html).toContain('src="https://cdn.example.com/site/assets/');
});
