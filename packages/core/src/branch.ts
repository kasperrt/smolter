import type { NestedRoute } from "./nested.ts";
import type {
  RevalidationArgs,
  RouteDiscovery,
  RouterOptions,
} from "./types.ts";
// Only nested routing enables per-operation layout context.
export let nestedCapability: WeakMap<AbortSignal, RevalidationArgs> | undefined;
export function enableNestedCapability() {
  nestedCapability ??= new WeakMap();
}

/** Optional application base path in addition to normal router options. */
export interface NestedRouterOptions extends RouterOptions {
  basename?: string;
  /** Discover authorized nested definitions, including ancestors the client does not know yet. */
  discover?: RouteDiscovery<NestedRoute>;
}
export function resolveBranchURL(url: URL, basename?: string) {
  const base = basename?.replace(/\/$/, "");
  if (base && url.pathname !== base && !url.pathname.startsWith(`${base}/`))
    url.pathname = base + url.pathname;
  return url;
}
