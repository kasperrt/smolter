/** Optional flat-file routing for Preact builds. @module */

import type { Plugin } from "vite";
import {
  routerPlugin as createPlugin,
  type FileRouterOptions,
} from "./internal/vite/index.ts";

export * from "./internal/files/index.ts";
export type { FileRouterOptions } from "./internal/vite/index.ts";

/** Configure flat routes and server transport for Preact. */
export function routerPlugin(options: FileRouterOptions = {}): Plugin {
  return createPlugin({ ...options, framework: "preact" });
}

/** File routing is the default; this alias keeps configuration explicit. */
export const fileRouter = routerPlugin;
