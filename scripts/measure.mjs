import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { minify } from "terser";

export async function measure(entry, names) {
  const exports = names ? `{ ${names.join(", ")} }` : "*";
  const contents = Array.isArray(entry)
    ? entry
        .map((path) => `export ${exports} from ${JSON.stringify(path)};`)
        .join("\n")
    : `export ${exports} from ${JSON.stringify(entry)};`;
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

export const wouterRoutingExports = [
  "Router",
  "Route",
  "Switch",
  "Link",
  "useParams",
  "useLocation",
];

export async function measureAdapters() {
  const [
    react,
    preact,
    reactServer,
    preactServer,
    preactApplication,
    preactLazyApplication,
    reactData,
    reactRouting,
    preactRouting,
    reactCommon,
    preactCommon,
    wouterRouting,
    wouterPreactRouting,
    reactRouterRouting,
    reactRouterData,
    reactRouter,
  ] = await Promise.all([
    measure("./dist/react/index.js"),
    measure("./dist/preact/index.js"),
    measure(["./dist/react/index.js", "./dist/client/index.js"]),
    measure(["./dist/preact/index.js", "./dist/client/index.js"]),
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
    measure("./dist/react/data.js"),
    measure("./dist/react/index.js", routingExports),
    measure("./dist/preact/index.js", routingExports),
    measure("./dist/react/index.js", commonExports),
    measure("./dist/preact/index.js", commonExports),
    measure("wouter", wouterRoutingExports),
    measure("wouter-preact", wouterRoutingExports),
    measure("react-router", [
      "BrowserRouter",
      "Routes",
      "Route",
      "Link",
      "useParams",
      "useLocation",
    ]),
    measure("react-router", [
      "createBrowserRouter",
      "RouterProvider",
      "Link",
      "Form",
      "useLoaderData",
      "useActionData",
      "useParams",
      "useLocation",
      "useRevalidator",
      "useFetcher",
    ]),
    measure("react-router"),
  ]);

  return {
    react,
    preact,
    reactServer,
    preactServer,
    preactApplication,
    preactLazyApplication,
    reactData,
    reactRouting,
    preactRouting,
    reactCommon,
    preactCommon,
    wouterRouting,
    wouterPreactRouting,
    reactRouterRouting,
    reactRouterData,
    reactRouter,
  };
}
