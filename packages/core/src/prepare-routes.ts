import { safeWrapAsync } from "./errors.ts";
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
      wrapped[key] = async (args) => {
        const { data, error } = await safeWrapAsync(async () => ({
          value: await handler(args),
        }));
        const value = await normalizeResult(
          error ? error.cause : data!.value,
          !preserveDeferred && key !== "clientLoader",
        );
        if (key === "clientLoader") observeDeferred(value);
        return value;
      };
    }
    return wrapped;
  });
}

// Observe abandoned/speculative rejections without replacing consumer promises.
function observeDeferred(value: unknown, seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Promise) {
    const observe = async () => {
      const { data } = await safeWrapAsync(() => value);
      observeDeferred(data, seen);
    };
    void observe();
  } else if (
    Array.isArray(value) ||
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const field of Object.values(value)) observeDeferred(field, seen);
  }
}
