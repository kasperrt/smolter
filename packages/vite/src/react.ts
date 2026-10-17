/** Optional flat-file routing for React builds. @module */

import type { Plugin } from "vite";
import {
  routerPlugin as createPlugin,
  type FileRouterOptions,
} from "./index.ts";

export * from "@smolter/files";
export type { FileRouterOptions } from "./index.ts";

/** Configure flat routes and server transport for React. */
export function routerPlugin(options: FileRouterOptions = {}): Plugin {
  return createPlugin({ ...options, framework: "react" });
}

/** File routing is the default; this alias keeps configuration explicit. */
export const fileRouter = routerPlugin;

export {
  type DeploymentPluginOptions,
  deploymentPlugin,
} from "./deployment.ts";
