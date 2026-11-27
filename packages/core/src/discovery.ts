import { safeWrapAsync } from "./errors.ts";
import { compareRoutePaths, matchRoutes } from "./match.ts";
import type {
  DiscoveryCache,
  DiscoveryHost,
  DiscoveryTable,
  Route,
  RouteDiscovery,
  RouteResolver,
} from "./types.ts";
import { internalURL } from "./url.ts";

/** Attach discovery bookkeeping to a router: shared requests, remembered denials, ordered insertion and reset. */
export function withRouteDiscovery<R extends Route>(
  resolve: RouteResolver<R>,
): RouteDiscovery<R> {
  return { attach: (...args) => attachDiscovery(resolve, ...args) };
}

function attachDiscovery<R extends Route>(
  resolve: RouteResolver<R>,
  table: Route[],
  host: DiscoveryHost,
  cache: DiscoveryCache | undefined,
  transform: (routes: readonly R[]) => readonly Route[] = (routes) => routes,
): DiscoveryTable {
  const discovered = new Set<Route>();
  const denied = new Set<string>();
  const pending = new Map<string, Promise<boolean>>();
  let controller = new AbortController();
  // A splat may be a public fallback for a protected path, so it still asks once.
  const needs = (url: URL) =>
    matchRoutes(table, url.pathname)?.route.path.endsWith("*") ?? true;
  const request = async (url: URL, navigation: boolean) => {
    const { signal } = controller;
    const { data, error } = await safeWrapAsync(
      async () => transform(await resolve(url, { signal, navigation })),
      true,
    );
    if (signal.aborted) return false;
    pending.delete(url.pathname);
    if (error) return false;
    for (const route of data!) {
      if (table.includes(route)) continue;
      discovered.add(route);
      // Insert before the first less specific pattern, keeping existing order.
      const index = table.findIndex(
        (existing) => compareRoutePaths(route.path, existing.path) < 0,
      );
      table.splice(index === -1 ? table.length : index, 0, route);
    }
    const found = !needs(url);
    if (!found) denied.add(url.pathname);
    return found;
  };
  const load = (url: URL, navigation: boolean) => {
    const key = url.pathname;
    if (denied.has(key) || !needs(url)) return Promise.resolve(!needs(url));
    // Concurrent callers share one request; an abandoned navigation keeps authorized results.
    let shared = pending.get(key);
    if (!shared) {
      shared = request(url, navigation);
      pending.set(key, shared);
    }
    return shared;
  };
  return {
    needs,
    load,
    methods: {
      async discover(href) {
        const url = internalURL(host.getSnapshot().url, href);
        return Boolean(url && (await load(url, false)));
      },
      resetDiscovery() {
        controller.abort();
        controller = new AbortController();
        pending.clear();
        denied.clear();
        for (const route of discovered) table.splice(table.indexOf(route), 1);
        discovered.clear();
        cache?.clear();
      },
    },
    dispose() {
      controller.abort();
    },
  };
}
