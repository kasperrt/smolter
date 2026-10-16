import type { Match, Params, Route, RouteModule } from "./types.ts";

/** Associate a URL pattern with a module while retaining its inferred handler types. */
export function defineRoute<const M extends RouteModule>(
  path: string,
  module: M,
): Route<M> {
  return { ...module, path };
}

/** Static segments, :params and a terminal * wildcard; first match wins. */
export function matchRoutes(
  routes: readonly Route[],
  pathname: string,
): Match | undefined {
  const segments = pathname.replace(/\/$/, "").split("/");

  for (const route of routes) {
    const parts = route.path.replace(/\/$/, "").split("/");
    const params: Params = {};
    const matched = parts.every((part, index) => {
      const value = segments[index];

      if (part === "*") {
        params["*"] = segments.slice(index).join("/");

        return true;
      }

      if (part[0] === ":" && value) {
        params[part.slice(1)] = new URLSearchParams(
          `v=${value.replace(/\+/g, "%2B")}`,
        ).get("v")!;

        return true;
      }

      return part === value;
    });

    if (matched && (parts.at(-1) === "*" || parts.length === segments.length))
      return { route, params };
  }
}
