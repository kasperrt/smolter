import type { DocPage } from "@smolter/ui/docs";
import { createServer, type Plugin } from "vite";

/** Ship the navigation catalogue eagerly, and each article only when requested. */
export function splitDocumentation(): Plugin {
  const entry = new URL("../../packages/ui/src/docs/index.ts", import.meta.url)
    .pathname;
  const prefix = "\0smolter-doc:";
  let pages: DocPage[] = [];

  return {
    name: "smolter-split-documentation",
    apply: "build",
    enforce: "pre",
    async buildStart() {
      const server = await createServer({
        configFile: false,
        server: { middlewareMode: true, hmr: false },
        appType: "custom",
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        const module = await server.ssrLoadModule(entry);
        pages = module.docs;
      } finally {
        await server.close();
      }
    },
    resolveId(id) {
      if (id.startsWith(prefix)) return id;
    },
    load(id) {
      if (!id.startsWith(prefix)) return;
      const page = pages.find((page) => page.slug === id.slice(prefix.length));
      if (!page) this.error(`Unknown documentation page: ${id}`);
      return `export default ${JSON.stringify(page)};`;
    },
    transform(_code, id, options) {
      if (id !== entry || options?.ssr) return;
      const catalogue = pages.map(({ slug, title, kind }) => ({
        slug,
        title,
        kind,
      }));
      const imports = pages.map(
        (page) =>
          `${JSON.stringify(page.slug)}: () => import(${JSON.stringify(prefix + page.slug)})`,
      );
      return {
        code: `export const docs = ${JSON.stringify(catalogue)};
const articles = { ${imports.join(",")} };
export async function readDoc(slug = "getting-started") {
  const load = Object.hasOwn(articles, slug) && articles[slug];
  return load ? (await load()).default : new Error("Documentation page not found");
}`,
        map: null,
      };
    },
  };
}
