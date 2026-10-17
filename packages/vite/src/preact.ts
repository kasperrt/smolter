/** Optional flat-file routing for Preact builds. @module */

import type { Plugin } from "vite";
import {
  routerPlugin as createPlugin,
  type FileRouterOptions,
} from "./index.ts";

export * from "@smolter/files";
export type { FileRouterOptions } from "./index.ts";

/** Configure flat routes and server transport for Preact. */
export function routerPlugin(options: FileRouterOptions = {}): Plugin {
  return createPlugin({ ...options, framework: "preact" });
}

/** File routing is the default; this alias keeps configuration explicit. */
export const fileRouter = routerPlugin;

export type { ApplicationOptions } from "./application/vite.ts";
export {
  applicationPlugins,
  preactConfig,
} from "./application/vite.ts";

export {
  type DeploymentPluginOptions,
  deploymentPlugin,
} from "./deployment.ts";
