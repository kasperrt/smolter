import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { DiscoveredCapabilities, DiscoveredRoute } from "@smolter/core";
import { dataSuffix } from "@smolter/core/namespace";
import { flatRoutes } from "@smolter/files";
import type {
  DiscoveryManifestRoute,
  RouteDiscoveryManifest,
} from "@smolter/server";
import { type Plugin, transformWithOxc } from "vite";
import type { LazyRoutesAPI } from "../index.ts";
import { configuredNamespace } from "../namespace.ts";
import { within, writePrivateFile } from "../private-file.ts";

interface ChunkMetadata {
  importedCss?: Set<string>;
}

/** A route considered for withholding from public browser output. */
export interface DiscoverableRoute {
  path: string;
  id?: string;
}

/** Withhold routes from public browser output until the server authorizes them. */
export interface RouteDiscoveryBuildOptions {
  /** Return true for routes (and nested descendants) that anonymous clients must not see. */
  protect: (route: DiscoverableRoute) => boolean;
  /** Private manifest for createRequestHandler, relative to the Vite root and outside client output and publicDir. */
  manifestFile: string;
}

interface WithheldRoute {
  definition: Omit<DiscoveredRoute, "file" | "styles">;
  reference: string;
}

interface ManifestEntry {
  route: DiscoveryManifestRoute;
  /** Browser module of a withheld route. */
  module?: string;
}

interface BundleFiles {
  files: string[];
  styles: string[];
}

// Same length as the 24-character build ID, so emitted source maps stay aligned.
const buildPlaceholder = "__SMOLTER_ROUTE_BUILD___";

// Reuse Smolter's file discovery and server-export stripping. Only the browser
// route manifest changes: matched routes load before their data is committed.
export function lazyFiles(
  directory: string,
  dataEndpoint: string | undefined = undefined,
  framework: "react" | "preact" = "preact",
  discovery?: RouteDiscoveryBuildOptions,
): Plugin {
  let root: string;
  const modules = new Map<string, string>();
  let suffix = dataSuffix();
  let building = false;
  let base = "/";
  let manifestFile: string | undefined;
  let publicDirectories: string[] = [];
  let manifestRoutes: ManifestEntry[] = [];
  let nestedRoutes = false;
  let privateManifest: string | undefined;
  const withheld = new Map<string, WithheldRoute>();
  return {
    name: "smolter-lazy-routes",
    enforce: "pre",
    api: { routeDiscovery: Boolean(discovery) } satisfies LazyRoutesAPI,
    configResolved(config) {
      root = resolve(config.root, directory);
      suffix = dataSuffix(configuredNamespace(config));
      // Development serves every route; production builds withhold protected ones.
      building = Boolean(discovery) && config.command === "build";
      base = config.base;
      publicDirectories = [
        resolve(config.root, config.build.outDir),
        ...(config.publicDir ? [config.publicDir] : []),
      ];
      manifestFile = discovery && resolve(config.root, discovery.manifestFile);
      if (
        building &&
        publicDirectories.some((directory) => within(directory, manifestFile!))
      )
        throw new Error(
          "routeDiscovery.manifestFile must be outside client output and publicDir",
        );
    },
    // After Vite's CSS plugin, which records stylesheets of emitted route chunks late.
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        function collect(entry: string): BundleFiles {
          const files = new Set<string>();
          const styles = new Set<string>();
          function visit(file: string) {
            if (files.has(file)) return;
            const dependency = bundle[file];
            if (dependency?.type !== "chunk") return;
            files.add(file);
            const metadata = dependency.viteMetadata as
              | ChunkMetadata
              | undefined;
            for (const stylesheet of metadata?.importedCss ?? []) {
              if (bundle[stylesheet]?.type === "asset") styles.add(stylesheet);
            }
            for (const imported of dependency.imports) visit(imported);
          }
          visit(entry);
          return { files: [...files], styles: [...styles] };
        }
        if (building) {
          const definitions = new Map<string, DiscoveredRoute>();
          for (const [id, route] of withheld) {
            const fileName = this.getFileName(route.reference);
            const { styles } = collect(fileName);
            definitions.set(id, {
              ...route.definition,
              file: `${base}${fileName}`,
              styles: styles.map((style) => `${base}${style}`),
            });
          }
          const routes = manifestRoutes.map(({ route, module }) =>
            module ? { ...route, route: definitions.get(module) } : route,
          );
          const build = createHash("sha256")
            .update(JSON.stringify(routes))
            .digest("hex")
            .slice(0, buildPlaceholder.length);
          const manifest: RouteDiscoveryManifest = {
            build,
            nested: nestedRoutes,
            routes,
          };
          privateManifest = JSON.stringify(manifest);
          for (const chunk of Object.values(bundle)) {
            if (chunk.type === "chunk" && chunk.code.includes(buildPlaceholder))
              chunk.code = chunk.code.replaceAll(buildPlaceholder, build);
          }
        }
        if (!modules.size) return;
        const routes = [];
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk" || !chunk.facadeModuleId) continue;
          const path = modules.get(chunk.facadeModuleId);
          if (!path) continue;
          routes.push({ path, ...collect(chunk.fileName) });
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
    },
    async writeBundle() {
      if (!building || !privateManifest || !manifestFile) return;
      await writePrivateFile(
        manifestFile,
        privateManifest,
        publicDirectories,
        "routeDiscovery.manifestFile",
      );
    },
    async load(id, options) {
      if (id !== "\0virtual:smolter/routes" || options?.ssr) return;
      const discovered = await flatRoutes(root, true);
      if (discovered instanceof Error) return this.error(discovered.message);
      const nested = discovered.some((route) => route.parentId);
      const routes = nested ? discovered : await flatRoutes(root);
      if (routes instanceof Error) return this.error(routes.message);
      if (routes.some((route) => route.path.endsWith(suffix)))
        return this.error(
          `The ${suffix} suffix is reserved for data transport.`,
        );
      modules.clear();
      withheld.clear();
      manifestRoutes = [];
      nestedRoutes = nested;
      // A protected layout withholds its descendants, which cannot render without it.
      const byId = new Map(routes.map((route) => [route.id, route]));
      const protectedFiles = new Set<string>();
      for (const route of routes) {
        let current: typeof route | undefined = route;
        while (building && current) {
          if (discovery!.protect({ path: current.path, id: current.id })) {
            protectedFiles.add(route.file);
            break;
          }
          current = current.parentId ? byId.get(current.parentId) : undefined;
        }
      }
      const directory = await realpath(root);
      const definitions: string[] = [];
      for (const route of routes) {
        this.addWatchFile(route.file);
        const canonical = await realpath(route.file);
        const path = relative(directory, canonical);
        if (
          path.startsWith("..") ||
          isAbsolute(path) ||
          resolve(directory, path) !== canonical
        )
          return this.error("Forbidden client route module");
        const source = await readFile(canonical, "utf8");
        const transformed = await transformWithOxc(source, route.file);
        const ast = this.parse(transformed.code);
        const fields: Record<string, string | boolean> = {};
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
          }
        }
        if (fields.id || fields.routePath)
          return this.error(
            `File routes derive identity and paths from filenames: remove id/routePath exports from ${route.file}. Use [.] for a literal dot.`,
          );
        // Export discovery records capabilities, never routing configuration.
        fields.path = route.path;
        if (dataEndpoint) fields.dataEndpoint = dataEndpoint;
        const file = `${route.file.replaceAll("\\", "/")}?smolter-client`;
        const manifestRoute: DiscoveryManifestRoute = {
          path: route.path,
          ...(nested && {
            id: route.id,
            ...(route.parentId && { parentId: route.parentId }),
            ...(route.index && { index: true }),
            ...(route.pathless && { pathless: true }),
          }),
        };
        // A namespace escaping into lazyRoute retains every route export.
        // Select supported browser exports statically so the bundler can remove
        // unrelated helpers while preserving module and stylesheet side effects.
        const selected = [
          "default",
          "clientLoader",
          "clientAction",
          "meta",
          "links",
          "handle",
          "viewTransition",
          "HydrateFallback",
          "ErrorBoundary",
          "shouldRevalidate",
        ].filter((name) => fields[name]);
        const members = selected.map((name) => `${name}: $${name}`).join(", ");
        const capabilities = Object.fromEntries(
          [
            "path",
            "dataEndpoint",
            "loader",
            "action",
            "clientAction",
            "meta",
            "shouldRevalidate",
            "ErrorBoundary",
          ]
            .filter((name) => name in fields)
            .map((name) => [name, fields[name]]),
        );
        if (protectedFiles.has(route.file)) {
          const discovered: DiscoveredCapabilities = Object.fromEntries(
            Object.entries(capabilities).filter(([name]) => name !== "path"),
          );
          // Emitted separately under an opaque name; only the private manifest refers to it.
          withheld.set(file, {
            definition: {
              ...manifestRoute,
              capabilities: discovered,
              exports: selected,
            },
            reference: this.emitFile({
              type: "chunk",
              id: file,
              // App builds drop entry exports by default; discovery imports them by name.
              preserveSignature: "exports-only",
              // Unique per module but derived only from a hash, never the route's file name.
              name: `route-${createHash("sha256").update(file).digest("hex").slice(0, 8)}`,
            }),
          });
          manifestRoutes.push({ route: manifestRoute, module: file });
          continue;
        }
        manifestRoutes.push({ route: manifestRoute });
        if (fields.default) modules.set(file, String(fields.path));
        if (nested) {
          const discoverIndex = routes.some(
            (child) =>
              child.parentId === route.id &&
              child.index &&
              protectedFiles.has(child.file),
          );
          definitions.push(
            `{ path: ${JSON.stringify(route.path)}, id: ${JSON.stringify(route.id)}, parentId: ${JSON.stringify(route.parentId)}, index: ${Boolean(route.index)}, pathless: ${Boolean(route.pathless)}, discoverIndex: ${discoverIndex}, lazy: async () => { const {${members}} = await import(${JSON.stringify(file)}); return {${members}}; } }`,
          );
          continue;
        }
        definitions.push(
          `lazyRoute(${JSON.stringify(capabilities)}, async () => { const {${members}} = await import(${JSON.stringify(file)}); return {${members}}; })`,
        );
      }
      return {
        meta: {
          // Withheld routes stay out of public deployment fingerprints.
          smolterRoutes: routes
            .filter((route) => !protectedFiles.has(route.file))
            .map((route) => ({
              path: route.path,
              id: `${route.file.replaceAll("\\", "/")}?smolter-client`,
            })),
        },
        code: [
          nested
            ? `export { createNestedRouter as createRouter, NestedRoutes as Routes } from "@kasperrt/smolter/${framework}/nested";`
            : `import { lazyRoute } from "@kasperrt/smolter/${framework}/lazy-route"; export { createDataRouter as createRouter, Routes } from "@kasperrt/smolter/${framework}";`,
          building
            ? `import { routeDiscoveryClient } from "@kasperrt/smolter/${framework}/${nested ? "nested" : "discovery"}"; export const discover = routeDiscoveryClient(${JSON.stringify(buildPlaceholder)});`
            : "export const discover = undefined;",
          `export default [${definitions.join(",\n")}];`,
        ].join("\n"),
      };
    },
  };
}
