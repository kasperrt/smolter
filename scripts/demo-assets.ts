import type { Plugin } from "vite";

/** Resolve shared CSS and fonts before JavaScript starts, in dev and builds. */
export function demoAssets(): Plugin {
  const directory = new URL("../packages/ui/src", import.meta.url).pathname;

  return {
    name: "shared-demo-assets",

    transformIndexHtml(html, context) {
      if (!context.server) return html;

      return html.replaceAll("/@smolter-ui/", `/@fs${directory}/`);
    },

    config() {
      return {
        resolve: {
          alias: {
            "/@smolter-ui": directory,
          },
        },
      };
    },
  };
}
