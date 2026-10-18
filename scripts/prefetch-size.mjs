import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "vite";
import { routerPlugin } from "../dist/vite/index.js";

// A production Link + data-router fixture, with framework runtimes external.
// These application fixtures are distinct from the named-export tables in size.mjs.
const root = await mkdtemp(join(tmpdir(), "smolter-prefetch-size-"));
await mkdir(join(root, "src"));
await writeFile(
  join(root, "tsconfig.json"),
  '{"compilerOptions":{"strict":true}}',
);
const rows = [];
for (const framework of ["react", "preact"]) {
  for (const [mode, value] of [
    ["none", '"none"'],
    ["intent", '"intent"'],
    ["viewport", '"viewport"'],
    ["union", 'globalThis.mode as "intent" | "viewport"'],
  ]) {
    for (const data of [false, true]) {
      if (mode === "none" && data) continue;
      await writeFile(
        join(root, "src/entry.tsx"),
        `import {Link, createDataRouter} from "@kasperrt/smolter/${framework}"; export const router = createDataRouter([]); export const Page = () => <Link to="/items" prefetch={${value}} prefetchData={${data}}>Items</Link>;`,
      );
      const built = await build({
        root,
        configFile: false,
        logLevel: "silent",
        plugins: [routerPlugin({ framework })],
        resolve: {
          alias: {
            [`@kasperrt/smolter/${framework}`]: resolve(
              `dist/${framework}/index.js`,
            ),
          },
        },
        build: {
          write: false,
          minify: true,
          lib: { entry: join(root, "src/entry.tsx"), formats: ["es"] },
          rolldownOptions: { external: /^(?:react|react-dom|preact)(?:\/|$)/ },
        },
      });
      const result = Array.isArray(built) ? built[0] : built;
      const code = result.output
        .filter((item) => item.type === "chunk")
        .map((item) => item.code)
        .join("\n");
      rows.push({
        framework,
        mode,
        data,
        raw: Buffer.byteLength(code),
        gzip: gzipSync(code, { level: 9 }).length,
        brotli: brotliCompressSync(code, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      });
    }
  }
}
await rm(root, { recursive: true, force: true });
console.table(rows);
if (process.argv[2])
  await writeFile(process.argv[2], `${JSON.stringify(rows, null, 2)}\n`);
