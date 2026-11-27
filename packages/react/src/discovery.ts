/**
 * React route discovery for protected routes withheld from public browser output.
 *
 * @module
 */

import { createDiscoveryClient } from "@smolter/client/discovery";
import type { RouteDiscovery } from "@smolter/core";
import {
  type LazyAppRoute,
  type LoadedRoute,
  lazyRoute,
} from "./lazy-route.ts";

export { withRouteDiscovery } from "@smolter/core/discovery";

/** Route discovery for flat file routes; build ties discovered modules to this deployment. */
export function routeDiscoveryClient(
  build: string,
): RouteDiscovery<LazyAppRoute> {
  return createDiscoveryClient(build, (route, load) =>
    lazyRoute(
      { ...route.capabilities, path: route.path, id: route.id },
      async () => (await load()) as LoadedRoute,
    ),
  );
}
