import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { safeWrapAsync } from "@smolter/core";
import type { Plugin } from "vite";
import { configuredNamespace, namespaceConfig } from "./namespace.ts";

/** Deployment manifest configuration. Serve the emitted file with Cache-Control: no-store. */
export interface DeploymentPluginOptions {
  /** Public URL, optionally on an asset host. Defaults to Vite base + manifestFile. */
  manifestURL?: string;
  /** Change when independently deployed server contracts become incompatible. */
  compatibility?: string;
  /** Emitted manifest file name. Defaults to `${namespace}-manifest.json`. */
  manifestFile?: string;
  /** Client-visible identifier prefix; see routerPlugin. Defaults to "smolter". */
  namespace?: string;
}

const manifestFilePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;

interface RouteModuleId {
  path: string;
  id: string;
}

interface RouteFingerprint {
  path: string;
  fingerprint: string;
}

/** Emit deterministic build and route dependency identities for deployment recovery. */
export function deploymentPlugin(
  options: DeploymentPluginOptions = {},
): Plugin {
  const virtualId = "\0virtual:smolter/deployment";
  const placeholder = "__SMOLTER_DEPLOYMENT_METADATA__";
  let enabled = false;
  let root = "";
  let manifestURL = "";
  let manifestFile = "";
  let environment = "";
  let metadata: {
    version: string;
    manifestURL: string;
    shared: string;
    routes: RouteFingerprint[];
  };
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex").slice(0, 24);
  const stable = (value: string) => value.replaceAll(root, "<root>");
  return {
    name: "smolter-deployment",
    config: () => namespaceConfig(options.namespace),
    configResolved(config) {
      manifestFile =
        options.manifestFile ?? `${configuredNamespace(config)}-manifest.json`;
      if (!manifestFilePattern.test(manifestFile))
        throw new TypeError(
          "manifestFile must be a .json file name without directories",
        );
      root = config.root;
      environment = JSON.stringify([
        config.base,
        config.build.target,
        config.build.minify,
        config.define,
        options.compatibility,
      ]);
      enabled = config.command === "build" && !config.build.ssr;
      manifestURL = options.manifestURL ?? `${config.base}${manifestFile}`;
    },
    resolveId(id) {
      if (id === "virtual:smolter/deployment") return virtualId;
    },
    load(id) {
      if (id !== virtualId) return;
      return `export default ${JSON.stringify(enabled ? placeholder : null)};`;
    },
    async buildEnd(error) {
      if (!enabled || error) return;
      const modules = [...this.getModuleIds()];
      const sources = new Map<string, string>();
      await Promise.all(
        modules.map(async (id) => {
          const module = this.getModuleInfo(id);
          // Include styles/assets and server exports stripped from browser routes.
          const file = id.split("?")[0];
          const raw = file.startsWith("/")
            ? await safeWrapAsync(() => readFile(file))
            : undefined;
          sources.set(
            id,
            stable(module?.code ?? "") +
              (raw?.data ? hash(raw.data.toString("base64")) : ""),
          );
        }),
      );
      const routeModule = this.getModuleInfo("\0virtual:smolter/routes");
      const routes = (routeModule?.meta.smolterRoutes ?? []) as RouteModuleId[];
      const routeIds = new Set(routes.map((route) => route.id));
      const fingerprint = (starts: string[], dynamic: boolean) => {
        const visited = new Set<string>();
        const visit = (id: string) => {
          if (visited.has(id) || id === virtualId) return;
          visited.add(id);
          const module = this.getModuleInfo(id);
          for (const dependency of module?.importedIds ?? []) visit(dependency);
          for (const dependency of module?.dynamicallyImportedIds ?? [])
            if (dynamic || !routeIds.has(dependency)) visit(dependency);
        };
        for (const id of starts) visit(id);
        return hash(
          JSON.stringify(
            [...visited]
              .sort()
              .map((id) => [stable(id), sources.get(id) ?? ""]),
          ) + environment,
        );
      };
      metadata = {
        version: fingerprint(modules, true),
        manifestURL,
        shared: fingerprint(
          modules.filter((id) => this.getModuleInfo(id)?.isEntry),
          false,
        ),
        routes: routes.map((route) => ({
          path: route.path,
          fingerprint: fingerprint([route.id], true),
        })),
      };
    },
    renderChunk(code) {
      if (!enabled || !code.includes(placeholder)) return;
      return code.replace(new RegExp(`["']${placeholder}["']`, "g"), () =>
        JSON.stringify(metadata),
      );
    },
    generateBundle() {
      if (!enabled) return;
      this.emitFile({
        type: "asset",
        fileName: manifestFile,
        source: JSON.stringify(metadata),
      });
    },
  };
}
