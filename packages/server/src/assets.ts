import { matchRoutes } from "@smolter/core";

export interface RouteAssets {
  path: string;
  files: string[];
}

export function routePreloads(
  routes: RouteAssets[],
  pathname: string,
  base: string,
): string {
  const match = matchRoutes(routes, pathname);
  const route = match?.route as RouteAssets | undefined;

  return (route?.files ?? [])
    .map((file) => `<${base.replace(/\/$/, "")}/${file}>; rel=modulepreload`)
    .join(", ");
}
