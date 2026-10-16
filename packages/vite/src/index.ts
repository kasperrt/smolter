import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { flatRoutes } from "@smolter/files";
import { type Plugin, transformWithOxc } from "vite";
import { configureTransport } from "./transport.ts";

export interface FileRouterOptions {
  directory?: string;
  clientRoutes?: string;
  serverRoutes?: string;
}

/** Build-time flat route discovery and the optional server data transport. */
export function routerPlugin({
  directory = "src/routes",
  clientRoutes,
  serverRoutes,
}: FileRouterOptions = {}): Plugin {
  let root: string;
  let projectRoot: string;
  const publicId = "virtual:smolter/routes";
  const virtualId = `\0${publicId}`;
  const suffix = "?smolter-client";

  return {
    name: "smolter-flat-routes",
    enforce: "pre",

    configResolved(config) {
      projectRoot = config.root;
      root = resolve(config.root, directory);
    },

    resolveId(id) {
      if (id === publicId) return virtualId;
    },

    async load(id, options) {
      if (id.endsWith(suffix)) {
        const file = id.slice(0, -suffix.length);
        const transformed = await transformWithOxc(
          await readFile(file, "utf8"),
          file,
        );
        const ast = this.parse(transformed.code);
        const edits: [number, number][] = [];

        for (const statement of ast.body) {
          if (statement.type === "ExportAllDeclaration") {
            return this.error(
              `Use explicit named exports in ${file}; export * cannot be safely split between server and browser.`,
            );
          }

          if (statement.type !== "ExportNamedDeclaration") continue;

          const server = statement.specifiers.filter((specifier) => {
            const name =
              specifier.exported.type === "Identifier"
                ? specifier.exported.name
                : specifier.exported.value;

            return name === "loader" || name === "action";
          });

          if (!server.length) {
            const declaration = statement.declaration;
            const name =
              declaration?.type === "FunctionDeclaration"
                ? declaration.id?.name
                : undefined;
            const variables =
              declaration?.type === "VariableDeclaration"
                ? declaration.declarations
                : [];

            if (
              name === "loader" ||
              name === "action" ||
              variables.some(
                (item) =>
                  item.id.type === "Identifier" &&
                  ["loader", "action"].includes(item.id.name),
              )
            ) {
              return this.error(
                `Re-export loader/action from separate files in ${file}; inline server handlers cannot enter a browser module.`,
              );
            }

            continue;
          }

          if (
            !statement.source ||
            server.length !== statement.specifiers.length
          ) {
            return this.error(
              `Use separate export { loader } / export { action } statements in ${file}.`,
            );
          }

          edits.push([statement.start, statement.end]);
        }

        let code = transformed.code;

        for (const [start, end] of edits.reverse())
          code = code.slice(0, start) + code.slice(end);

        return { code, map: null };
      }

      if (id !== virtualId) return;

      if (clientRoutes || serverRoutes) {
        if (!clientRoutes || !serverRoutes)
          return this.error(
            "Specify both clientRoutes and serverRoutes for manual routing.",
          );

        const entry = resolve(
          projectRoot,
          options?.ssr ? serverRoutes : clientRoutes,
        ).replaceAll("\\", "/");

        return `export { routes as default } from ${JSON.stringify(entry)};`;
      }

      const routes = await flatRoutes(root);

      if (routes instanceof Error) return this.error(routes.message);

      const imports: string[] = [];
      const definitions: string[] = [];

      for (const [index, route] of routes.entries()) {
        this.addWatchFile(route.file);

        const file = route.file.replaceAll("\\", "/");
        const transformed = await transformWithOxc(
          await readFile(file, "utf8"),
          file,
        );
        const ast = this.parse(transformed.code);
        const handlers: Record<string, boolean> = {};

        for (const statement of ast.body) {
          if (statement.type !== "ExportNamedDeclaration") continue;

          for (const specifier of statement.specifiers) {
            const name =
              specifier.exported.type === "Identifier"
                ? specifier.exported.name
                : specifier.exported.value;

            if (name === "loader" || name === "action") handlers[name] = true;
          }
        }

        imports.push(
          `import * as route${index} from ${JSON.stringify(file + (options?.ssr ? "" : suffix))};`,
        );
        definitions.push(
          options?.ssr || !Object.keys(handlers).length
            ? `{ ...route${index}, path: ${JSON.stringify(route.path)} }`
            : `serverRoute(${JSON.stringify(route.path)}, route${index}, ${JSON.stringify(handlers)})`,
        );
      }

      if (
        !options?.ssr &&
        definitions.some((definition) => definition.startsWith("serverRoute("))
      )
        imports.unshift('import { serverRoute } from "smolter/client";');

      return `${imports.join("\n")}\nexport default [${definitions.join(",\n")}];\n`;
    },

    configureServer(server) {
      server.watcher.add(root);

      const refresh = (file: string) => {
        if (!file.startsWith(`${root}/`)) return;

        const module = server.moduleGraph.getModuleById(virtualId);

        if (module) server.moduleGraph.invalidateModule(module);

        server.ws.send({ type: "full-reload" });
      };

      server.watcher.on("add", refresh);
      server.watcher.on("change", refresh);
      server.watcher.on("unlink", refresh);
      server.httpServer?.once("close", () => {
        server.watcher.off("add", refresh);
        server.watcher.off("change", refresh);
        server.watcher.off("unlink", refresh);
      });

      configureTransport(server, publicId);
    },
  };
}

/** File routing is the default; this alias keeps configuration explicit. */
export const fileRouter = routerPlugin;
