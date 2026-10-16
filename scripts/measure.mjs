import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";

export async function measure(entry) {
  const contents = Array.isArray(entry)
    ? entry.map((path) => `export * from ${JSON.stringify(path)};`).join("\n")
    : `export * from ${JSON.stringify(entry)};`;
  const result = await build({
    stdin: { contents, resolveDir: new URL("..", import.meta.url).pathname },
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

  return gzipSync(output.code, { level: 9 }).byteLength;
}

export async function measureAdapters() {
  const [react, preact, reactServer, preactServer] = await Promise.all([
    measure("@smolter/react"),
    measure("@smolter/preact"),
    measure(["@smolter/react", "@smolter/client"]),
    measure(["@smolter/preact", "@smolter/client"]),
  ]);

  return { react, preact, reactServer, preactServer };
}
