import { matchRoutes } from "@smolter/core";

export interface RouteAssets {
  path: string;
  files: string[];
  styles?: string[];
}

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
      (file) => `<${prefix}/${file}>; rel=preload; as=style; crossorigin`,
    ),
    ...(route?.files ?? []).map(
      (file) => `<${prefix}/${file}>; rel=modulepreload`,
    ),
  ].join(", ");
}
