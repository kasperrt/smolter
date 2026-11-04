import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "vite";
import { expect, it } from "vitest";
import { applicationPlugins } from "../src/application/vite.ts";

it.for(["react", "preact"] as const)(
  "%s only bundles used file-route capabilities",
  async (framework, context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-optional-routing-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "src/routes"), { recursive: true });
    await writeFile(
      join(root, "tsconfig.json"),
      '{"compilerOptions":{"strict":true}}',
    );
    for (const nested of [false, true]) {
      const layout = join(root, "src/routes/_layout.ts");
      const page = join(
        root,
        `src/routes/${nested ? "_layout." : ""}_index.ts`,
      );
      await rm(join(root, "src/routes/_index.ts"), { force: true });
      if (nested)
        await writeFile(
          layout,
          'export default function Layout() { return "layout"; }',
        );
      for (const transitions of [false, true]) {
        await writeFile(
          page,
          `export default function Page() { return "page"; } ${transitions ? 'export function viewTransition(commit) { console.log("OWNED_TRANSITION"); commit(); }' : ""}`,
        );
        await writeFile(
          join(root, "src/entry.ts"),
          nested
            ? 'import routes, { createRouter, Routes } from "virtual:smolter/routes"; export const router = createRouter(routes); console.log(Routes);'
            : `import routes from "virtual:smolter/routes"; import { mountApplication } from "@kasperrt/smolter/${framework}/client"; export const start = () => mountApplication(routes, {});`,
        );
        const result = await build({
          root,
          configFile: false,
          logLevel: "silent",
          plugins: applicationPlugins({ framework, ssr: false }),
          resolve: {
            alias: ["client", "nested", "lazy-route", ""].map((entry) => ({
              find: `@kasperrt/smolter/${framework}${entry ? `/${entry}` : ""}`,
              replacement: resolve(`dist/${framework}/${entry || "index"}.js`),
            })),
          },
          build: {
            write: false,
            minify: true,
            lib: { entry: join(root, "src/entry.ts"), formats: ["es"] },
            rolldownOptions: {
              external: /^(?:react|react-dom|preact)(?:\/|$)/,
            },
          },
        });
        const built = Array.isArray(result) ? result[0] : result;
        if (!("output" in built)) throw new Error("Missing build output");
        const chunks = built.output.filter((item) => item.type === "chunk");
        const retained = chunks.flatMap((chunk) =>
          Object.entries(chunk.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) => id),
        );
        expect(retained.some((id) => id.endsWith("/core/nested.js"))).toBe(
          nested,
        );
        expect(
          retained.some((id) => id.endsWith(`/${framework}/nested.js`)),
        ).toBe(nested);
        const code = chunks.map((chunk) => chunk.code).join("\n");
        expect(code.includes("viewTransition")).toBe(transitions);
        expect(code.includes("OWNED_TRANSITION")).toBe(transitions);
        expect(code).not.toMatch(/typescript|node:fs|startViewTransition/);
        console.info(
          JSON.stringify({
            framework,
            nested,
            transitions,
            raw: Buffer.byteLength(code),
            gzip: gzipSync(code, { level: 9 }).length,
            brotli: brotliCompressSync(code).length,
          }),
        );
      }
    }
  },
);
