import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";

async function measure(entry) {
  const result = await build({
    stdin: { contents: `export * from "${entry}"`, resolveDir: process.cwd() },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
    external: ["react", "react-dom", "preact", "preact/*"],
  });
  const output = await minify(result.outputFiles[0].text, {
    module: true,
    compress: { passes: 3 },
    mangle: true,
  });
  return gzipSync(output.code).byteLength;
}
for (const [adapter, baseline] of [
  ["react", "wouter"],
  ["preact", "wouter-preact"],
]) {
  const [actual, reference] = await Promise.all([
    measure(`./packages/smolter/dist/${adapter}.js`),
    measure(baseline),
  ]);
  console.log(
    `${adapter}: smolter ${actual} B gzip; ${baseline}@3.13.0 ${reference} B; ${reference - actual} B smaller`,
  );
  if (actual >= reference || actual > 2500) process.exitCode = 1;
}
console.log(`core: ${await measure("./packages/smolter/dist/core.js")} B gzip`);
console.log(
  "All browser exports; identical esbuild + Terser settings; dependencies included, framework excluded. SSR helpers use the separate /server entry.",
);
