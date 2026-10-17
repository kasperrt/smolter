import { builtinModules } from "node:module";
import type { Plugin } from "vite";

const builtins = new Set(builtinModules.flatMap((id) => [id, `node:${id}`]));

const forbiddenModules = [
  /(?:vite-browser-external|__vite-browser-external)/,
  /\/node_modules\/(?:react|react-dom|react-router|react-router-dom)\//,
  /\/smolter\/dist\/(?:internal\/)?(?:server|vite|files)\//,
  /\/smolter\/packages\/(?:server|vite)\/src\//,
  /\/vite\/dist\/node\//,
  /\/src\/[^?]*\.server\.[cm]?[jt]sx?(?:\?|$)/,
];

/** Check emitted modules, after tree shaking, rather than import strings. */
export function browserBoundary(): Plugin {
  return {
    name: "smolter-browser-boundary",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;

        for (const id of [...output.imports, ...output.dynamicImports]) {
          if (!builtins.has(id)) continue;

          this.error(`Node builtin in browser chunk ${output.fileName}: ${id}`);
        }

        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll("\\", "/");

          if (!forbiddenModules.some((pattern) => pattern.test(normalized)))
            continue;

          this.error(`Unexpected browser module in ${output.fileName}: ${id}`);
        }
      }
    },
  };
}
