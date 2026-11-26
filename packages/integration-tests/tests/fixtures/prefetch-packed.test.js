import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import ts from "typescript";
import { build } from "vite";
import { expect, test } from "vitest";

test("prefetch-packed consumer", async () => {
  expect(ts.version).toBe("7.0.2");
  expect(ts.sys).toBe(undefined);
  expect(ts.createProgram).toBe(undefined);
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
          ...(ssr ? { ssr: resolve("build-fixture/src/entry.tsx") } : {}),
          lib: {
            entry: resolve("build-fixture/src/entry.tsx"),
            formats: ["es"],
          },
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
