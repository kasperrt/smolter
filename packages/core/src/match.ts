import { nestedCapability } from "./branch.ts";
import type {
  DataArgs,
  DataFunction,
  Match,
  Params,
  Route,
  RouteModule,
} from "./types.ts";

const patterns = new Map<string, string[]>();
const MAX_PATTERNS = 256;

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
    let parts = patterns.get(route.path);
    if (!parts) {
      parts = route.path.replace(/\/$/, "").split("/");
      if (patterns.size === MAX_PATTERNS)
        patterns.delete(patterns.keys().next().value!);
      patterns.set(route.path, parts);
    }
    if (parts.length !== segments.length && parts.at(-1) !== "*") continue;
    const params: Params = {};
    if (
      parts.every((part, index) => {
        const value = segments[index];
        if (part === "*") {
          params["*"] = segments.slice(index).join("/");
          return true;
        }
        if (part[0] === ":" && value) {
          params[part.slice(1)] = new URLSearchParams(
            `=${value.replace(/[+&]/g, encodeURIComponent)}`,
          ).get("")!;
          return true;
        }
        return part === value;
      })
    )
      return { route, params };
  }
}

// Static segments outrank the end of a pattern, then parameters, then splats.
function segmentRank(part: string | undefined): number {
  if (part === "*") return 0;
  if (part?.startsWith(":")) return 1;
  return part === undefined ? 2 : 3;
}

/** Order route patterns so more specific patterns match first. */
export function compareRoutePaths(left: string, right: string): number {
  const a = left.replace(/\/$/, "").split("/");
  const b = right.replace(/\/$/, "").split("/");
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = segmentRank(b[index]) - segmentRank(a[index]);
    if (difference) return difference;
  }
  return 0;
}

// Page, fetcher and speculative reads share the same request contract.
export function callRoute(
  match: Match,
  url: URL,
  signal: AbortSignal,
  reason: DataArgs["reason"],
  body?: FormData,
  method = "POST",
): unknown {
  const fn =
    match.route[body ? "clientAction" : "clientLoader"] ||
    match.route[body ? "action" : "loader"];
  if (!fn) return body && Error("No action");
  return (fn as DataFunction)({
    reason,
    ...(nestedCapability && { revalidation: nestedCapability.get(signal) }),
    request: new Request(url, { signal, method: body && method, body }),
    params: match.params,
    signal,
  });
}
