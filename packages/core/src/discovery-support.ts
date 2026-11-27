import type {
  DiscoveryCache,
  DiscoveryHost,
  DiscoveryTable,
  Route,
  RouteDiscovery,
} from "./types.ts";

/** Attach configured route discovery to a router; Vite builds without routeDiscovery replace this module.
 * @smolter/route-discovery
 */
export function attachDiscovery(
  discover: RouteDiscovery,
  routes: Route[],
  host: DiscoveryHost,
  cache: DiscoveryCache | undefined,
): DiscoveryTable {
  return discover.attach(routes, host, cache);
}
