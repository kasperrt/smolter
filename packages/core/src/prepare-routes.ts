import { normalizeResult } from "./responses.ts";
import type { DataFunction, Route } from "./types.ts";

type AppRoute = Route & { routePath?: string; preload?: () => Promise<void> };

export function prepareRoutes(
  routes: AppRoute[],
  preserveDeferred = false,
): AppRoute[] {
  return routes.map((route) => {
    const wrapped: AppRoute = {
      ...route,
      path: route.routePath ?? route.path,
      shouldRevalidate: (args) => {
        const { currentUrl, nextUrl } = args;

        if (
          args.reason === "navigation" &&
          currentUrl.pathname === nextUrl.pathname &&
          currentUrl.search === nextUrl.search &&
          currentUrl.hash !== nextUrl.hash
        )
          return false;

        return route.shouldRevalidate?.(args) ?? args.defaultShouldRevalidate;
      },
    };

    for (const key of [
      "loader",
      "action",
      "clientLoader",
      "clientAction",
    ] as const) {
      const handler = route[key] as DataFunction | undefined;

      if (!handler) continue;

      wrapped[key] = (args) =>
        Promise.resolve()
          .then(() => handler(args))
          .then(
            (value) => normalizeResult(value, !preserveDeferred),
            (error) => normalizeResult(error, !preserveDeferred),
          );
    }

    return wrapped;
  });
}
