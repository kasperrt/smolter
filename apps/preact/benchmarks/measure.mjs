import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";

export async function measure(entry, names, detailed = false) {
  const exports = names ? `{ ${names.join(", ")} }` : "*";
  const paths = (Array.isArray(entry) ? entry : [entry]).map((path) =>
    path.startsWith(".")
      ? fileURLToPath(new URL(`../../../${path}`, import.meta.url))
      : path,
  );
  const contents = Array.isArray(entry)
    ? paths
        .map((path) => `export ${exports} from ${JSON.stringify(path)};`)
        .join("\n")
    : `export ${exports} from ${JSON.stringify(paths[0])};`;
  const result = await build({
    stdin: {
      contents,
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
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
  const gzip = gzipSync(output.code, { level: 9 }).byteLength;
  return detailed
    ? {
        raw: Buffer.byteLength(output.code),
        gzip,
        brotli: brotliCompressSync(output.code, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).byteLength,
      }
    : gzip;
}

export const routingExports = [
  "createRouter",
  "defineRoute",
  "RouterProvider",
  "Routes",
  "Link",
  "useParams",
  "useLocation",
];

export const commonExports = [
  "createDataRouter",
  "defineRoute",
  "RouterProvider",
  "Routes",
  "Link",
  "Form",
  "useRouter",
  "useLoaderData",
  "useActionData",
  "useParams",
  "useLocation",
  "useRevalidator",
  "useFetcher",
];

export async function measureAdapters() {
  const [
    react,
    preact,
    reactServer,
    preactServer,
    reactApplication,
    reactLazyApplication,
    preactApplication,
    preactLazyApplication,
  ] = await Promise.all([
    measure("./dist/react/index.js"),
    measure("./dist/preact/index.js"),
    measure(["./dist/react/index.js", "./dist/client/index.js"]),
    measure(["./dist/preact/index.js", "./dist/client/index.js"]),
    measure([
      "./dist/react/index.js",
      "./dist/react/client.js",
      "./dist/react/document.js",
    ]),
    measure([
      "./dist/react/index.js",
      "./dist/react/client.js",
      "./dist/react/document.js",
      "./dist/react/lazy-route.js",
    ]),
    measure([
      "./dist/preact/index.js",
      "./dist/preact/client.js",
      "./dist/preact/document.js",
    ]),
    measure([
      "./dist/preact/index.js",
      "./dist/preact/client.js",
      "./dist/preact/document.js",
      "./dist/preact/lazy-route.js",
    ]),
  ]);
  const combinations = JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/ui/src/size-combinations.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  return {
    react,
    preact,
    reactServer,
    preactServer,
    reactApplication,
    reactLazyApplication,
    preactApplication,
    preactLazyApplication,
    reactRouting: combinations.react[0][1],
    preactRouting: combinations.preact[0][1],
    reactCommon: combinations.react[1][1],
    preactCommon: combinations.preact[1][1],
    ...JSON.parse(
      readFileSync(
        new URL(
          "../../../packages/ui/src/comparison-sizes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ).sizes,
  };
}
