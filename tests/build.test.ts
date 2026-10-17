import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build as bundleBrowser } from "esbuild";
import { minify } from "terser";
import ts from "typescript";
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
          contents: `export { ${exports} } from "./dist/${framework}/index.js";`,
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
        modules.some(
          (name) =>
            /(?:^|\/)dist\/(server|vite|files|client)\//.test(name) ||
            /dist\/preact\/(client|document)\.js$/.test(name),
        ),
      ).toBe(false);
      expect(result.outputFiles[0].text).not.toMatch(
        /node:|from["']vite|handleRequest|loadRouter/,
      );

      return result;
    };

    const navigation = await bundle(
      "createRouter, defineRoute, RouterProvider, Routes, Link, useParams, useLocation",
    );
    const retained = Object.values(navigation.metafile.outputs).flatMap(
      (output) =>
        Object.entries(output.inputs)
          .filter(([, input]) => input.bytesInOutput > 0)
          .map(([name]) => name),
    );

    expect(retained).toContain("dist/core/navigation-router.js");
    expect(retained).not.toContain("dist/core/router.js");
    expect(retained).not.toContain("dist/core/resources.js");
    expect(retained).not.toContain("dist/core/submission.js");
    expect(navigation.outputFiles[0].text).not.toMatch(
      /AbortController|new Request|createFetcher|registerRevalidator/,
    );

    const minimal = await bundle("defineRoute");
    const complete = await bundle(
      "defineRoute, createDataRouter, RouterProvider, Link, Form, Routes, useFetcher, useLoaderData, useActionData, useRevalidator",
    );

    expect(minimal.outputFiles[0].text.length).toBeLessThan(300);
    expect(minimal.outputFiles[0].text.length).toBeLessThan(
      complete.outputFiles[0].text.length / 10,
    );
  });
}

for (const configured of [false, true]) {
  it(
    "Preact tree-shakes deployment callbacks (configured: " + configured + ")",
    async () => {
      const result = await bundleBrowser({
        stdin: {
          contents: [
            'export { Link } from "./dist/preact/index.js";',
            ...(configured
              ? [
                  'export { configureApplication } from "./dist/preact/client.js";',
                ]
              : []),
          ].join("\n"),
          resolveDir: process.cwd(),
        },
        bundle: true,
        platform: "browser",
        format: "esm",
        minify: true,
        write: false,
        external: ["preact", "preact/*"],
      });
      const { code } = await minify(result.outputFiles[0].text, {
        module: true,
        compress: { passes: 3 },
        mangle: true,
      });

      for (const callback of [
        "resolveURL",
        "isDocumentHandoff",
        "leaveDocument",
      ]) {
        expect(code?.includes(callback)).toBe(configured);
      }
    },
  );
}

it("publishes only renderer entries and browser-safe utilities", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const jsr = JSON.parse(readFileSync("jsr.json", "utf8"));
  const entries = [
    "./react",
    "./preact",
    "./utils",
    "./preact/lazy-route",
    "./preact/document",
    "./utils/assets",
    "./utils/http",
    "./react/data",
    "./utils/responses",
  ];

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

it("bundles hydration serialization without server dispatch or a renderer", async () => {
  const result = await bundleBrowser({
    stdin: {
      contents: 'export { serialize } from "./dist/core/utils.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "browser",
    format: "esm",
    minify: true,
    metafile: true,
    write: false,
  });
  const modules = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([name]) => name),
  );

  expect(modules).toEqual(["dist/core/serialize.js"]);
  expect(result.outputFiles[0].text).not.toMatch(
    /handleRequest|loadRouter|node:|react|preact/,
  );
});

it("keeps optional application and resource bundles isolated", async () => {
  for (const entry of ["react-data", "preact"]) {
    const result = await bundleBrowser({
      entryPoints: [
        `dist/${entry === "react-data" ? "react/data" : "preact/index"}.js`,
      ],
      bundle: true,
      platform: "browser",
      format: "esm",
      external: ["react", "react/*", "preact", "preact/*"],
      metafile: true,
      write: false,
    });
    const inputs = Object.keys(result.metafile.inputs);

    expect(
      inputs.some((name) => /(?:^|\/)dist\/(server|vite|files)\//.test(name)),
    ).toBe(false);
    expect(result.outputFiles[0].text).not.toMatch(
      /node:|preact-render-to-string/,
    );

    if (entry === "react-data") {
      expect(inputs.some((name) => name.includes("/preact/"))).toBe(false);
      expect(result.outputFiles[0].text).not.toMatch(
        /\b(document|window|history|FormData|Request)\b/,
      );
    }
  }
});

it("keeps workspace source imports behind package exports", () => {
  for (const name of [
    "core",
    "react",
    "preact",
    "client",
    "server",
    "files",
    "vite",
  ]) {
    const source = resolve("packages", name, "src");
    const files = readdirSync(source, { recursive: true, encoding: "utf8" });

    for (const file of files.filter((file) => /\.tsx?$/.test(file))) {
      const filename = resolve(source, file);
      const content = readFileSync(filename, "utf8");
      const module = ts.createSourceFile(
        filename,
        content,
        ts.ScriptTarget.Latest,
        true,
      );

      for (const statement of module.statements) {
        if (
          !ts.isImportDeclaration(statement) &&
          !ts.isExportDeclaration(statement)
        )
          continue;

        const specifier = statement.moduleSpecifier;

        if (!specifier || !ts.isStringLiteral(specifier)) continue;

        expect(
          specifier.text.startsWith("@kasperrt/smolter"),
          `${name}/${file}: public package import`,
        ).toBe(false);
      }

      for (const [, specifier] of content.matchAll(
        /(?:from\s*|import\s*\()"(\.[^"]+)"/g,
      )) {
        const target = resolve(dirname(filename), specifier);

        expect(
          target.startsWith(`${source}/`),
          `${name}/${file}: ${specifier}`,
        ).toBe(true);
      }
    }
  }
});

it("keeps error wrapping internal and application context hooks public", async () => {
  for (const entry of ["core/utils", "preact/index", "react/index"]) {
    const result = await bundleBrowser({
      entryPoints: [`dist/${entry}.js`],
      bundle: true,
      format: "esm",
      platform: "browser",
      packages: "external",
      metafile: true,
      write: false,
    });
    const exports = Object.values(result.metafile.outputs).flatMap(
      (output) => output.exports,
    );
    expect(exports).not.toContain("safeWrapAsync");
    if (entry !== "core/utils") {
      expect(exports).toContain("useMatches");
      expect(exports).toContain("useOutletContext");
    }
  }
});
