import { basename } from "node:path";
import type { Plugin } from "vite";

/** Resolve shared CSS and fonts before JavaScript starts, in dev and builds. */
export function demoAssets(): Plugin {
  const directory = new URL("../../packages/ui/src", import.meta.url).pathname;

  return {
    name: "shared-demo-assets",

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
