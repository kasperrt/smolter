import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";

/** Combination measured by size-combinations.ts as [raw, gzip, brotli] bytes. */
type CombinationSize = [number, number, number];

/** Recorded combination sizes per framework, keyed by feature mask. */
export interface CombinationSizes {
  react: Record<string, CombinationSize>;
  preact: Record<string, CombinationSize>;
}

/** Reference package measured outside this build. */
export interface ReferencePackage {
  name: string;
  version: string;
  bytes: number;
}

interface ComparisonSizes {
  wouterRouting: number;
  wouterPreactRouting: number;
  reactRouterRouting: number;
  reactRouterData: number;
  reactRouter: number;
}

/** Recorded competitor measurements and the reference packages they came from. */
export interface Comparison {
  packages: ReferencePackage[];
  sizes: ComparisonSizes;
}

/** Gzip bytes of each measured adapter bundle, plus recorded comparisons. */
export interface AdapterSizes extends ComparisonSizes {
  react: number;
  preact: number;
  reactServer: number;
  preactServer: number;
  reactApplication: number;
  reactLazyApplication: number;
  preactApplication: number;
  preactLazyApplication: number;
  reactRouting: number;
  preactRouting: number;
  reactCommon: number;
  preactCommon: number;
}

/** Gzip bytes of the minified bundle that re-exports names (or everything) from entry. */
export async function measure(
  entry: string | string[],
  names?: readonly string[],
): Promise<number> {
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
  return gzipSync(output.code ?? "", { level: 9 }).byteLength;
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

export async function measureAdapters(): Promise<AdapterSizes> {
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
  const combinations: CombinationSizes = JSON.parse(
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
    ...readComparison().sizes,
  };
}

/** Read the recorded competitor measurements. */
export function readComparison(): Comparison {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../../packages/ui/src/comparison-sizes.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}
