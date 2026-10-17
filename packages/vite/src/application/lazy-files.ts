import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flatRoutes } from "@smolter/files";
import { type Plugin, transformWithOxc } from "vite";

// Reuse Smolter's file discovery and server-export stripping. Only the browser
// route manifest changes: matched routes load before their data is committed.
export function lazyFiles(
  directory: string,
  dataEndpoint = "/_smolter",
): Plugin {
  let root: string;
  const modules = new Map<string, string>();

  return {
    name: "smolter-lazy-routes",
    enforce: "pre",
    configResolved(config) {
      root = resolve(config.root, directory);
    },
    generateBundle(_options, bundle) {
      if (!modules.size) return;

      const routes = [];

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.facadeModuleId) continue;

        const path = modules.get(chunk.facadeModuleId);

        if (!path) continue;

        const files = new Set<string>();

        function visit(file: string) {
          if (files.has(file)) return;

          files.add(file);

          const dependency = bundle[file];

          if (dependency?.type !== "chunk") return;

          for (const imported of dependency.imports) visit(imported);
        }

        visit(chunk.fileName);
        routes.push({ path, files: [...files] });
      }

      const paths = [...modules.values()];

      routes.sort(
        (left, right) => paths.indexOf(left.path) - paths.indexOf(right.path),
      );

      this.emitFile({
        type: "asset",
        fileName: ".vite/route-assets.json",
        source: JSON.stringify(routes),
      });
    },
    async load(id, options) {
      if (id !== "\0virtual:smolter/routes" || options?.ssr) return;

      const routes = await flatRoutes(root);

      if (routes instanceof Error) return this.error(routes.message);

      modules.clear();

      const definitions: string[] = [];

      for (const route of routes) {
        this.addWatchFile(route.file);

        const source = await readFile(route.file, "utf8");
        const transformed = await transformWithOxc(source, route.file);
        const ast = this.parse(transformed.code);
        const fields: Record<string, string | boolean> = {
          path: route.path,
          dataEndpoint,
        };

        for (const statement of ast.body) {
          if (statement.type === "ExportDefaultDeclaration") {
            fields.default = true;
            continue;
          }

          if (statement.type !== "ExportNamedDeclaration") continue;

          if (statement.declaration?.type === "FunctionDeclaration") {
            const name = statement.declaration.id?.name;

            if (name) fields[name] = true;
          }

          for (const specifier of statement.specifiers) {
            const name =
              specifier.exported.type === "Identifier"
                ? specifier.exported.name
                : specifier.exported.value;

            fields[name] = true;
          }

          if (statement.declaration?.type !== "VariableDeclaration") continue;

          for (const declaration of statement.declaration.declarations) {
            if (declaration.id.type === "Identifier")
              fields[declaration.id.name] = true;

            if (
              declaration.id.type !== "Identifier" ||
              declaration.init?.type !== "Literal" ||
              typeof declaration.init.value !== "string"
            )
              continue;

            const name = declaration.id.name;

            if (name === "id") fields.id = declaration.init.value;

            if (name === "routePath") fields.path = declaration.init.value;
          }
        }

        const file = `${route.file.replaceAll("\\", "/")}?smolter-client`;

        if (fields.default) modules.set(file, String(fields.path));

        definitions.push(
          `lazyRoute(${JSON.stringify(fields)}, () => import(${JSON.stringify(file)}))`,
        );
      }

      return [
        'import { lazyRoute } from "@kasperrt/smolter/preact/lazy-route";',
        `export default [${definitions.join(",\n")}];`,
      ].join("\n");
    },
  };
}
