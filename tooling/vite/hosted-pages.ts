import { resolve } from "node:path";
import { createServer, type Plugin, type ResolvedConfig } from "vite";

interface RenderedPage {
  html: string;
  data: string;
  title: string;
}

/** Emit pre-rendered landing and documentation pages for static hosting. */
export function hostedPages(framework: "react" | "preact"): Plugin {
  let config: ResolvedConfig;

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
    configResolved(resolved) {
      config = resolved;
    },
    async generateBundle(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") this.error("Missing site entry document");

      const template = String(index.source);
      const server = await createServer({
        configFile: false,
        root: config.root,
        base: config.base,
        define: config.define,
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
        optimizeDeps: { noDiscovery: true, include: [] },
        ssr: { noExternal: ["@smolter/ui"] },
      });

      try {
        const { prerender, paths } = (await server.ssrLoadModule(
          "/src/prerender.ts",
        )) as {
          prerender: (path: string) => Promise<RenderedPage>;
          paths: string[];
        };

        for (const route of paths) {
          const { html, data, title } = await prerender(`/${route}`);
          const source = template
            .replace(
              /<title>.*?<\/title>/,
              `<title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>`,
            )
            .replace("<!--app-->", html)
            .replace(
              "<!--data-->",
              `<script id="smolter-data" type="application/json">${data}</script>`,
            );

          if (!route) index.source = source;
          else
            this.emitFile({
              type: "asset",
              fileName: `${route}/index.html`,
              source,
            });
        }
      } finally {
        await server.close();
      }

      for (const route of [
        "tasks",
        "tasks/1",
        "tasks/search",
        "examples/counter",
      ]) {
        this.emitFile({
          type: "asset",
          fileName: `${route}/index.html`,
          source: template,
        });
      }
    },
  };
}
