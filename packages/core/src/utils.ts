/**
 * Routing patterns, query strings and serialized data utilities.
 *
 * @module
 */
export { defineRoute, matchRoutes } from "./match.ts";
export { namespace } from "./namespace.ts";
export * from "./serialize.ts";
export { internalURL, navigationClick } from "./url.ts";
