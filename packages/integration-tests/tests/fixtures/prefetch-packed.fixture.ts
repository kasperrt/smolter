import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { build, type Rolldown } from "vite";
import { expect, test } from "vitest";

test("prefetch-packed consumer", async () => {
  expect(ts.version).toBe("7.0.2");
  expect("sys" in ts).toBe(false);
  expect("createProgram" in ts).toBe(false);
  const framework = process.env.SMOLTER_PACKED_FRAMEWORK;
  const tooling = `@kasperrt/smolter/${framework}/vite`;
  const compiler = createRequire(import.meta.resolve(tooling))(
    "typescript/unstable/sync",
  );
  expect(typeof compiler.API).toBe("function");
  const { fileRouter } = await import(tooling);
  mkdirSync("build-fixture/src", { recursive: true });
  writeFileSync(
    "build-fixture/tsconfig.json",
    '{"compilerOptions":{"strict":true},"include":["src"]}',
  );
  for (const [attributes, expected] of [
    ['prefetch="none"', [false, false, false]],
    ['prefetch="viewport" prefetchData', [false, true, true]],
    ["{...props}", [true, true, true]],
  ]) {
    writeFileSync(
      "build-fixture/src/entry.tsx",
      `import {Link, createDataRouter} from "@kasperrt/smolter/${framework}";
declare const props: {prefetch: "intent" | "viewport", prefetchData?: boolean};
export const router = createDataRouter([]);
export const Page = () => <Link to="/item" ${attributes}>Item</Link>;`,
    );
    for (const ssr of [false, true]) {
      const built = await build({
        root: resolve("build-fixture"),
        configFile: false,
        logLevel: "silent",
        plugins: [fileRouter({ framework })],
        ssr: { noExternal: ["@kasperrt/smolter"] },
        build: {
          write: false,
          minify: true,
          ...(ssr && { ssr: resolve("build-fixture/src/entry.tsx") }),
          lib: {
            entry: resolve("build-fixture/src/entry.tsx"),
            formats: ["es"],
          },
          rolldownOptions: { external: /^(?:react|react-dom|preact)(?:\/|$)/ },
        },
      });
      const result = Array.isArray(built) ? built[0] : built;
      const output: (Rolldown.OutputChunk | Rolldown.OutputAsset)[] =
        "output" in result ? result.output : [];
      const chunks = output.filter((item) => item.type === "chunk");
      expect(chunks.length).toBeGreaterThan(0);
      const modules = chunks.flatMap((chunk) =>
        Object.entries(chunk.modules)
          .filter(([, module]) => module.renderedLength > 0)
          .map(([id]) => id),
      );
      for (const [index, name] of ["intent", "viewport", "prefetch"].entries())
        expect(
          modules.some((id) => id.endsWith(`/core/${name}.js`)),
          `${framework} ${ssr} ${attributes}: ${name}`,
        ).toBe(expected[index]);
      expect(chunks.map((chunk) => chunk.code).join("\n")).not.toMatch(
        /typescript|node:|createProgram/,
      );
    }
  }
});

test("packed prerender worker renders explicitly selected routes", async () => {
  const tooling = `@kasperrt/smolter/${process.env.SMOLTER_PACKED_FRAMEWORK}/vite`;
  const { prerenderPlugin, deploymentPlugin } = await import(tooling);
  const root = resolve("prerender-fixture");
  mkdirSync(root, { recursive: true });
  writeFileSync(
    resolve(root, "entry.client.ts"),
    'console.log("packed prerender");',
  );
  writeFileSync(
    resolve(root, "entry.server.ts"),
    'setInterval(() => {}, 1000); export default (request: Request, entry: string) => new Response(`<h1>${new URL(request.url).pathname}</h1><script src="${entry}"></script>`, { headers: { "Content-Type": "text/html" } });',
  );
  for (const ssr of [false, true])
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      base: "/docs/",
      plugins: [
        deploymentPlugin({ namespace: "__app", manifestFile: "__appm" }),
        prerenderPlugin({
          paths: ["/selected"],
          clientEntry: "entry.client.ts",
        }),
      ],
      build: {
        outDir: ssr ? "dist/server" : "dist/client",
        ...(ssr && { ssr: "entry.server.ts" }),
        rollupOptions: { input: ssr ? "entry.server.ts" : "entry.client.ts" },
      },
    });
  expect(
    readFileSync(resolve(root, "dist/client/selected/index.html"), "utf8"),
  ).toContain("/docs/selected");
  expect(
    JSON.parse(readFileSync(resolve(root, "dist/client/__appm"), "utf8")),
  ).toHaveProperty("version");
});
