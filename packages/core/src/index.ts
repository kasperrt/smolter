/** Framework-independent data routing. @module */

export * from "./errors.ts";
export { defineRoute, matchRoutes } from "./match.ts";
export * from "./navigation-router.ts";
export * from "./router.ts";
export * from "./serialize.ts";
export * from "./types.ts";
export { internalURL, navigationClick } from "./url.ts";
