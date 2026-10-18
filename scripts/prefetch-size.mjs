import { writeFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";
import { commonExports } from "./measure.mjs";

const rows = [];
for (const framework of ["react", "preact"]) {
  for (const capabilities of [
    [],
    ["viewportPrefetch"],
    ["dataPrefetch"],
    ["viewportPrefetch", "dataPrefetch"],
  ]) {
    const result = await build({
      stdin: {
        contents: `export { ${[...commonExports, ...capabilities].join(", ")} } from "./dist/${framework}/index.js";`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
      define: { "process.env.NODE_ENV": '"production"' },
      external: ["react", "react-dom", "preact", "preact/*"],
    });
    const { code } = await minify(result.outputFiles[0].text, {
      module: true,
      compress: { passes: 3 },
      mangle: true,
    });
    rows.push({
      framework,
      capabilities: capabilities.join(" + ") || "neither",
      raw: Buffer.byteLength(code),
      gzip: gzipSync(code, { level: 9 }).length,
      brotli: brotliCompressSync(code, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    });
  }
}
console.table(rows);
if (process.argv[2])
  writeFileSync(process.argv[2], `${JSON.stringify(rows, null, 2)}\n`);
