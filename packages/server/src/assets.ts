/**
 * Production route asset discovery for SSR preload hints.
 *
 * @module
 */
import { matchRoutes } from "@smolter/core";

/** Emitted JavaScript and stylesheet URLs associated with a route. */
export interface RouteAssets {
  path: string;
  files: string[];
  styles?: string[];
}

const unsafeLinkTarget = /[<>\r\n\u0000-\u0020\u007f]/;

function preloadTarget(prefix: string, file: string): string {
  const target = `${prefix}/${file}`;
  if (unsafeLinkTarget.test(target))
    throw new Error("Unsafe preload asset URL");
  return target;
}

/** Collect matched-route JavaScript and stylesheet assets from the production route manifest. */
export function routePreloads(
  routes: RouteAssets[],
  pathname: string,
  base: string,
): string {
  const match = matchRoutes(routes, pathname);
  const route = match?.route as RouteAssets | undefined;
  const prefix = base.replace(/\/$/, "");
  return [
    ...(route?.styles ?? []).map(
      (file) =>
        `<${preloadTarget(prefix, file)}>; rel=preload; as=style; crossorigin`,
    ),
    ...(route?.files ?? []).map(
      (file) => `<${preloadTarget(prefix, file)}>; rel=modulepreload`,
    ),
  ].join(", ");
}
