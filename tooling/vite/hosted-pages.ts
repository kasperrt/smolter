import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Emit static entry documents for the routes served by GitHub Pages. */
export function hostedPages(framework: "react" | "preact"): Plugin {
  return {
    name: "smolter-hosted-pages",
    enforce: "post",
    apply: (_config, environment) => environment.mode === "hosted",
    config() {
      return {
        base: `/smolter/${framework}/`,
        define: { "import.meta.env.VITE_HOSTED": JSON.stringify("true") },
        build: {
          outDir: resolve(import.meta.dirname, `../../site/${framework}`),
          emptyOutDir: true,
        },
      };
    },
    generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") this.error("Missing site entry document");

      const docs = readdirSync(
        resolve(import.meta.dirname, "../../packages/ui/src/docs/pages"),
      ).map((file) => `docs/${file.replace(/\.json$/, "")}`);

      for (const route of [
        "tasks",
        "tasks/1",
        "tasks/search",
        "examples/counter",
        "docs",
        ...docs,
      ]) {
        this.emitFile({
          type: "asset",
          fileName: `${route}/index.html`,
          source: index.source,
        });
      }
    },
  };
}
