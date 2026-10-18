import { matchRoutes } from "./match.ts";
import type {
  NavigateOptions,
  Route,
  Router,
  RouterOptions,
  Snapshot,
} from "./types.ts";
import { internalURL } from "./url.ts";

/** Navigation and subscriptions without the loader/action engine. */
export type NavigationRouter = Pick<
  Router,
  "routes" | "getSnapshot" | "subscribe" | "start" | "navigate" | "dispose"
>;

/** Route modules for navigation only; data handlers require createDataRouter. */
export type NavigationRoute = Route & {
  loader?: never;
  action?: never;
  clientLoader?: never;
  clientAction?: never;
  shouldRevalidate?: never;
};

/** Initial URL and optional browser history for navigation-only routing. */
export type NavigationRouterOptions = Pick<RouterOptions, "url" | "browser">;

/** Create a route matcher and history store without data requests or fetchers. */
export function createRouter(
  routes: readonly NavigationRoute[],
  options: NavigationRouterOptions = {},
): NavigationRouter {
  const browser = options.browser && typeof window !== "undefined";
  const listeners = new Set<() => void>();
  let users = 0;
  const resolve = (url: URL): Snapshot => {
    const match = matchRoutes(routes, url.pathname);
    return {
      url: url.href,
      path: match?.route.path,
      params: match?.params ?? {},
      state: "idle",
      loaded: true,
    };
  };
  let snapshot = resolve(
    new URL(options.url ?? (browser ? location.href : "/"), "http://localhost"),
  );
  const update = (url: URL) => {
    if (url.href === snapshot.url) return;
    snapshot = resolve(url);
    for (const listener of listeners) listener();
  };
  const pop = () => update(new URL(location.href));
  return {
    routes,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (!users++ && browser) {
        addEventListener("popstate", pop);
        addEventListener("hashchange", pop);
        pop();
      }
      return () => {
        if (!--users && browser) {
          removeEventListener("popstate", pop);
          removeEventListener("hashchange", pop);
        }
      };
    },
    async navigate(href: string, operation?: NavigateOptions) {
      const url = internalURL(snapshot.url, href);
      if (!url) return;
      if (browser)
        history[operation?.replace ? "replaceState" : "pushState"](
          operation?.state ?? null,
          "",
          url,
        );
      update(url);
    },
    dispose() {
      listeners.clear();
      if (browser) {
        removeEventListener("popstate", pop);
        removeEventListener("hashchange", pop);
      }
    },
  };
}
