import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build as bundleBrowser } from "esbuild";
import { build } from "vite";
import { expect, it } from "vitest";

for (const name of ["react", "preact", "react-ssr", "preact-ssr"]) {
  it(`${name} excludes server modules and the other framework from its browser build`, async () => {
    const result = await build({
      root: resolve("apps", name),
      logLevel: "silent",
      build: { write: false },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const modules = outputs.flatMap((output) =>
      "output" in output
        ? output.output.flatMap((chunk) =>
            chunk.type === "chunk" ? Object.keys(chunk.modules) : [],
          )
        : [],
    );

    expect(modules.length).toBeGreaterThan(0);

    expect(modules.some((module) => /\.server\.[jt]s/.test(module))).toBe(
      false,
    );

    if (name.startsWith("preact")) {
      expect(
        modules.some((module) => /\/react(?:-dom)?(?:@|\/)/.test(module)),
      ).toBe(false);
    }

    if (name.startsWith("react")) {
      expect(
        modules.some((module) => module.includes("react-compiler-runtime")),
      ).toBe(true);

      expect(modules.some((module) => /\/preact(?:@|\/)/.test(module))).toBe(
        false,
      );
    }
  });
}

for (const framework of ["react", "preact"]) {
  it(`${framework} tree-shakes unused APIs and keeps server/build modules out`, async () => {
    const bundle = async (exports: string) => {
      const result = await bundleBrowser({
        stdin: {
          contents: `export { ${exports} } from "./packages/smolter/dist/${framework}.js";`,
          resolveDir: process.cwd(),
        },
        bundle: true,
        platform: "browser",
        format: "esm",
        minify: true,
        metafile: true,
        write: false,
        external: ["react", "preact/compat"],
      });
      const modules = Object.values(result.metafile.outputs).flatMap((output) =>
        Object.entries(output.inputs)
          .filter(([, input]) => input.bytesInOutput > 0)
          .map(([name]) => name),
      );

      expect(
        modules.some((name) =>
          /\/internal\/(server|vite|files|client)\//.test(name),
        ),
      ).toBe(false);
      expect(result.outputFiles[0].text).not.toMatch(
        /node:|from["']vite|handleRequest|loadRouter/,
      );

      return result;
    };

    const minimal = await bundle("defineRoute");
    const complete = await bundle(
      "defineRoute, createRouter, RouterProvider, Link, Form, Routes, useFetcher, useLoaderData, useActionData, useRevalidator",
    );

    expect(minimal.outputFiles[0].text.length).toBeLessThan(300);
    expect(minimal.outputFiles[0].text.length).toBeLessThan(
      complete.outputFiles[0].text.length / 10,
    );
  });
}

it("publishes only renderer entries and browser-safe utilities", () => {
  const manifest = JSON.parse(
    readFileSync("packages/smolter/package.json", "utf8"),
  );
  const jsr = JSON.parse(readFileSync("packages/smolter/jsr.json", "utf8"));
  const entries = ["./react", "./preact", "./utils"];

  for (const renderer of ["react", "preact"]) {
    for (const part of ["client", "server", "vite"])
      entries.push(`./${renderer}/${part}`);
  }

  expect(Object.keys(manifest.exports).sort()).toEqual(entries.sort());
  expect(Object.keys(jsr.exports).sort()).toEqual(
    entries.filter((entry) => !entry.endsWith("/vite")).sort(),
  );
  expect(manifest.sideEffects).toBe(false);
  expect(manifest.version).toBe(jsr.version);
});
