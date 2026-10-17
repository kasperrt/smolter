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

export type { ApplicationOptions } from "./application/vite.ts";
export {
  type DeploymentPluginOptions,
  deploymentPlugin,
} from "./deployment.ts";

import {
  type ApplicationOptions,
  applicationPlugins as plugins,
} from "./application/vite.ts";

/** Configure React application SSR, scoped data transport and lazy file routing. */
export function applicationPlugins(options: ApplicationOptions = {}): Plugin[] {
  return plugins({ ...options, framework: "react" });
}
