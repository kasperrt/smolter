import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { build } from "vite";

assert.equal(ts.version, "7.0.2");
assert.equal(ts.sys, undefined);
assert.equal(ts.createProgram, undefined);
const framework = process.argv[2];
const tooling = `@kasperrt/smolter/${framework}/vite`;
const compiler = createRequire(import.meta.resolve(tooling))(
  "typescript-compiler",
);
assert.equal(compiler.version, "6.0.3");
assert.equal(typeof compiler.createProgram, "function");
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
        ...(ssr ? { ssr: resolve("build-fixture/src/entry.tsx") } : {}),
        lib: { entry: resolve("build-fixture/src/entry.tsx"), formats: ["es"] },
        rolldownOptions: { external: /^(?:react|react-dom|preact)(?:\/|$)/ },
      },
    });
    const result = Array.isArray(built) ? built[0] : built;
    const chunks = result.output.filter((item) => item.type === "chunk");
    const modules = chunks.flatMap((chunk) =>
      Object.entries(chunk.modules)
        .filter(([, module]) => module.renderedLength > 0)
        .map(([id]) => id),
    );
    for (const [index, name] of ["intent", "viewport", "prefetch"].entries())
      assert.equal(
        modules.some((id) => id.endsWith(`/core/${name}.js`)),
        expected[index],
        `${framework} ${ssr} ${attributes}: ${name}`,
      );
    assert.doesNotMatch(
      chunks.map((chunk) => chunk.code).join("\n"),
      /typescript|node:|createProgram/,
    );
  }
}
console.log(
  `Packed ${framework} browser/SSR prefetch builds passed with consumer TS7`,
);
