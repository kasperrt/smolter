import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Plugin } from "vite";

/** Resolve shared CSS and fonts before JavaScript starts, in dev and builds. */
export function demoAssets(): Plugin {
  const directory = new URL("../../packages/ui/src", import.meta.url).pathname;
  let base = "/";
  return {
    name: "shared-demo-assets",
    configResolved(config) {
      base = config.base;
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const file of ["fonts/pixelify-sans-500.ttf", "favicon.svg"]) {
          const asset = this.emitFile({
            type: "asset",
            name: basename(file),
            source: readFileSync(`${directory}/${file}`),
          });
          for (const output of Object.values(bundle)) {
            if (output.type !== "asset" || !output.fileName.endsWith(".html"))
              continue;
            output.source = String(output.source).replaceAll(
              `/@smolter-ui/${file}`,
              `${base}${this.getFileName(asset)}`,
            );
          }
        }
      },
    },
    transformIndexHtml(html, context) {
      if (!context.server) return html;
      return html.replaceAll("/@smolter-ui/", `/@fs${directory}/`);
    },
    config() {
      const basePort = Number(process.env.SMOLTER_PORT ?? 5173);
      const index = ["react", "preact", "react-ssr", "preact-ssr"].indexOf(
        basename(process.cwd()),
      );
      return {
        server: { port: basePort + index, strictPort: true },
        define: {
          "import.meta.env.VITE_EXAMPLE_BASE_PORT": JSON.stringify(basePort),
        },
        resolve: {
          alias: {
            "/@smolter-ui": directory,
          },
        },
      };
    },
  };
}
