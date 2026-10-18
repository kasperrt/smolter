import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { expect, it } from "vitest";
import { fileRouter } from "../packages/vite/src/index.ts";

for (const framework of ["react", "preact"] as const) {
  it(`${framework} Vite builds retain only typed prefetch modes in browser and SSR output`, async (context) => {
    const root = await mkdtemp(join(tmpdir(), "smolter-prefetch-build-"));
    context.onTestFinished(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "tsconfig.json"),
      '{"compilerOptions":{"strict":true}}',
    );
    await writeFile(
      join(root, "src/props.ts"),
      'export const props = globalThis.choice as {prefetch: "intent" | "viewport", prefetchData?: boolean};',
    );
    const cases: [string, boolean, boolean, boolean][] = [
      ['prefetch="none"', false, false, false],
      ["", true, false, false],
      ['prefetch="intent"', true, false, false],
      ['prefetch="viewport"', false, true, false],
      [
        'prefetch={globalThis.choice as "intent" | "viewport"}',
        true,
        true,
        false,
      ],
      ["{...props}", true, true, true],
      [
        '{...props} prefetch="viewport" prefetchData={false}',
        false,
        true,
        false,
      ],
      ['prefetch="viewport" prefetchData', false, true, true],
      ['prefetch="intent" prefetchData', true, false, true],
    ];
    for (const [attributes, intent, viewport, data] of cases) {
      await writeFile(
        join(root, "src/entry.tsx"),
        `import {Link, createDataRouter} from "@kasperrt/smolter/${framework}"; import {props} from "./props"; export const router = createDataRouter([]); export const Page = () => <Link to="/item" ${attributes}>Item</Link>;`,
      );
      for (const ssr of [false, true]) {
        const built = await build({
          root,
          configFile: false,
          logLevel: "silent",
          plugins: [fileRouter({ framework })],
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
            ...(ssr ? { ssr: join(root, "src/entry.tsx") } : {}),
            lib: { entry: join(root, "src/entry.tsx"), formats: ["es"] },
            rolldownOptions: {
              external: /^(?:react|react-dom|preact)(?:\/|$)/,
            },
          },
        });
        const result = Array.isArray(built) ? built[0] : built;
        if (!("output" in result)) throw new Error("Missing fixture output");
        const chunks = result.output.filter((entry) => entry.type === "chunk");
        const retained = chunks.flatMap((chunk) =>
          Object.entries(chunk.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) => id),
        );
        for (const [file, included] of [
          ["intent", intent],
          ["viewport", viewport],
          ["prefetch", data],
        ] as const)
          expect(
            retained.some((id) => id.endsWith(`/core/${file}.js`)),
            `${framework} ${ssr} ${attributes}: ${file}`,
          ).toBe(included);
        const code = chunks.map((chunk) => chunk.code).join("\n");
        expect(code.includes("IntersectionObserver")).toBe(viewport);
        expect(code).not.toMatch(/typescript|node:|\.server\./);
        const budget =
          (viewport ? (intent ? 3_500 : 3_400) : intent ? 3_300 : 3_100) +
          (data ? 700 : 0);
        expect(gzipSync(code, { level: 9 }).length).toBeLessThan(budget);
      }
    }
  }, 30_000);
}
