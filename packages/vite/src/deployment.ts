import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

/** Deployment manifest configuration. Serve the emitted file with Cache-Control: no-store. */
export interface DeploymentPluginOptions {
  /** Public URL, optionally on an asset host. Defaults to Vite base + smolter-manifest.json. */
  manifestURL?: string;
}

/** Emit a build manifest and expose its identity through virtual:smolter/deployment. */
export function deploymentPlugin(
  options: DeploymentPluginOptions = {},
): Plugin {
  const version = randomUUID();
  const virtualId = "\0virtual:smolter/deployment";
  let enabled = false;
  let manifestURL = "";

  return {
    name: "smolter-deployment",
    configResolved(config) {
      enabled = config.command === "build" && !config.build.ssr;
      manifestURL =
        options.manifestURL ?? `${config.base}smolter-manifest.json`;
    },
    resolveId(id) {
      if (id === "virtual:smolter/deployment") return virtualId;
    },
    load(id) {
      if (id !== virtualId) return;

      const deployment = enabled ? { version, manifestURL } : null;

      return `export default ${JSON.stringify(deployment)};`;
    },
    generateBundle() {
      if (!enabled) return;

      this.emitFile({
        type: "asset",
        fileName: "smolter-manifest.json",
        source: JSON.stringify({ version }),
      });
    },
  };
}
