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
  void route?.preload?.().catch(() => {});
  if (data && "prefetch" in router)
    void (router as Router).prefetch(destination.href);
}

// A callback ref owns exactly one observation, released on entry or unmount.
export function viewportRef(load: () => void, forwarded?: unknown) {
  let cleanup: (() => void) | undefined;
  return (element: HTMLAnchorElement | null) => {
    cleanup?.();
    cleanup = undefined;
    if (!element) return;
    const set = (node: HTMLAnchorElement | null) => {
      if (typeof forwarded === "function") return forwarded(node);
      if (forwarded && typeof forwarded === "object" && "current" in forwarded)
        forwarded.current = node;
    };
    const release = set(element);
    let active = true;
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            if (!active || !entries.some((entry) => entry.isIntersecting))
              return;
            active = false;
            observer?.disconnect();
            load();
          })
        : undefined;
    observer?.observe(element);
    cleanup = () => {
      active = false;
      observer?.disconnect();
      if (typeof release === "function") release();
      else set(null);
    };
  };
}
