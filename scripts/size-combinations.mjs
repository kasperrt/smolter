import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "vite";
import { routerPlugin } from "../dist/vite/index.js";
import { commonExports, routingExports } from "./measure.mjs";

// Measure complete combinations, never sums of separately compressed features.
const root = resolve(".generated/size-combinations");
await mkdir(join(root, "src"), { recursive: true });
await writeFile(
  join(root, "tsconfig.json"),
  '{"compilerOptions":{"strict":true}}',
);
const sizes = { react: {}, preact: {} };
for (const framework of ["react", "preact"]) {
  for (let mask = 0; mask < 64; mask++) {
    const data = Boolean(mask & 1);
    const ssr = Boolean(mask & 2);
    const intent = Boolean(mask & 4);
    const viewport = Boolean(mask & 8);
    const prefetch = Boolean(mask & 16);
    const recovery = Boolean(mask & 32);
    if (
      (ssr && !data) ||
      (recovery && !ssr) ||
      (prefetch && (!data || (!intent && !viewport)))
    )
      continue;
    const mode =
      intent && viewport
        ? '(Math.random() > 0.5 ? "intent" : "viewport")'
        : JSON.stringify(intent ? "intent" : viewport ? "viewport" : "none");
    const entry = `@kasperrt/smolter/${framework}`;
    const exports = (data ? commonExports : routingExports).filter(
      (name) => name !== "Link",
    );
    await writeFile(
      join(root, "src/entry.tsx"),
      `
import { Link } from "${entry}";
export { ${exports.join(",")} } from "${entry}";
export const Navigation = () => <Link to="/items" prefetch={${mode}} prefetchData={${prefetch}}>Items</Link>;
${ssr ? `export { mountApplication } from "${entry}/client"; export { Document, Scripts, Meta, Links } from "${entry}/document"; export { lazyRoute } from "${entry}/lazy-route";` : ""}
${recovery ? `export { watchDeployment, recoverDeployment } from "${entry}/client";` : ""}
`,
    );
    const built = await build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [routerPlugin({ framework })],
      resolve: {
        alias: [
          ...["client", "document", "lazy-route"].map((name) => ({
            find: `${entry}/${name}`,
            replacement: resolve(`dist/${framework}/${name}.js`),
          })),
          { find: entry, replacement: resolve(`dist/${framework}/index.js`) },
        ],
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
    sizes[framework][mask] = [
      Buffer.byteLength(code),
      gzipSync(code, { level: 9 }).length,
      brotliCompressSync(code, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    ];
  }
}
await rm(root, { recursive: true, force: true });
await writeFile(
  "packages/ui/src/size-combinations.json",
  `${JSON.stringify(sizes, null, 2).replace(/\[\s+(\d+),\s+(\d+),\s+(\d+)\s+\]/g, "[$1, $2, $3]")}\n`,
);
console.log(
  `Measured ${Object.keys(sizes.react).length} combinations per framework with the production Vite plugin.`,
);
