import { safeWrapAsync } from "./errors.ts";
import { matchRoutes } from "./match.ts";
import type { NavigationRouter } from "./navigation-router.ts";
import type { Router } from "./types.ts";

interface PreloadableRoute {
  preload?: () => Promise<void>;
}

/** Trigger speculative loading on intent or viewport entry, or disable it. */
export type PrefetchMode = "none" | "intent" | "viewport";

export function prefetchLink(
  router: NavigationRouter,
  destination: URL,
  data: boolean,
) {
  const prefetch = async () => {
    // Protected links are discovered (and authorized) before their module preloads.
    await (router as Router).discover?.(destination.href);
    const route = matchRoutes(router.routes, destination.pathname)?.route as
      | PreloadableRoute
      | undefined;
    if (data && "prefetch" in router)
      void (router as Router).prefetch(destination.href);
    await route?.preload?.();
  };
  void safeWrapAsync(prefetch);
}
