import { resolve } from "node:path";
import { safeWrapAsync } from "@smolter/core";
import { pageMetadata } from "@smolter/ui/metadata";
import { createServer, type Plugin, type ResolvedConfig } from "vite";
import { metadataTags } from "./site-metadata.ts";

interface RenderedPage {
  html: string;
  data: string;
  metadata: ReturnType<typeof pageMetadata>;
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
        base: framework === "preact" ? "/smolter/" : "/smolter/react/",
        define: { "import.meta.env.VITE_HOSTED": JSON.stringify("true") },
        build: {
          outDir: resolve(
            import.meta.dirname,
            framework === "preact" ? "../../site" : "../../site/react",
          ),
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
      const { error } = await safeWrapAsync(async () => {
        const { prerender, paths } = (await server.ssrLoadModule(
          "/src/prerender.ts",
        )) as {
          prerender: (path: string) => Promise<RenderedPage>;
          paths: string[];
        };
        if (framework === "preact") {
          for (const legacy of ["react", "preact"]) {
            for (const route of [
              ...paths,
              "tasks",
              "tasks/1",
              "tasks/search",
              "examples/counter",
            ]) {
              const target = `/smolter/${route}`;
              this.emitFile({
                type: "asset",
                fileName: `${legacy}/${route ? `${route}/` : ""}index.html`,
                source: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>smolter</title><link rel="canonical" href="${target}"><script>location.replace(${JSON.stringify(target)} + location.search + location.hash)</script><noscript><meta http-equiv="refresh" content="0;url=${target}"></noscript></head><body><a href="${target}">Continue to smolter</a></body></html>`,
              });
            }
          }
        }
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths
            .filter((path) => path !== "docs")
            .map(
              (path) =>
                `<url><loc>https://kasperrt.github.io/smolter/${path}${path ? "/" : ""}</loc></url>`,
            )
            .join("")}</urlset>`,
        });
        for (const route of paths) {
          const { html, data, metadata } = await prerender(`/${route}`);
          const source = template
            .replace(/<title>.*?<\/title>/, metadataTags(metadata))
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
      });
      await server.close();
      if (error) throw error.cause ?? error;
      for (const route of [
        "tasks",
        "tasks/1",
        "tasks/search",
        "examples/counter",
      ]) {
        this.emitFile({
          type: "asset",
          fileName: `${route}/index.html`,
          source: template.replace(
            /<title>.*?<\/title>/,
            metadataTags(pageMetadata(`/${route}`)),
          ),
        });
      }
    },
  };
}
