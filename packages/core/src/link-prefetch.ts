import { safeWrapAsync } from "./errors.ts";
import { matchRoutes } from "./match.ts";
import type { NavigationRouter } from "./navigation-router.ts";
import type { Router } from "./types.ts";

/** Trigger speculative loading on intent or viewport entry, or disable it. */
export type PrefetchMode = "none" | "intent" | "viewport";

export function prefetchLink(
  router: NavigationRouter,
  destination: URL,
  data: boolean,
) {
  const route = matchRoutes(router.routes, destination.pathname)?.route as
    | { preload?: () => Promise<void> }
    | undefined;
  void safeWrapAsync(() => route?.preload?.());
  if (data && "prefetch" in router)
    void (router as Router).prefetch(destination.href);
}
