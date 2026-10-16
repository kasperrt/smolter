import { resolve } from "node:path";
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
