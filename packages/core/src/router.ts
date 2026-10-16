import { safeWrapAsync } from "./errors.ts";
import { matchRoutes } from "./match.ts";
import type {
  DataFunction,
  NavigateOptions,
  Result,
  Route,
  Router,
  RouterOptions,
  Snapshot,
  SubmitOptions,
} from "./types.ts";
import { internalURL } from "./url.ts";

interface OperationOptions extends SubmitOptions, NavigateOptions {
  push?: boolean;
  hops?: number;
}

/** Create an isolated router. Use browser: true for browser history, or loadRouter for SSR. */
export function createRouter(
  routes: readonly Route[],
  options: RouterOptions = {},
): Router {
  const browser = options.browser && typeof window !== "undefined";
  const initial: Snapshot = options.hydrationData ?? {
    url: new URL(
      options.url ?? (browser ? window.location.href : "/"),
      "http://localhost",
    ).href,
    params: {},
    data: undefined,
    actionData: undefined,
    state: "idle",
  };
  const pending = new Set<AbortController>();
  const channel = (initial: Snapshot, local = false) => {
    let snapshot = initial;
    let controller: AbortController | undefined;
    const listeners = new Set<() => void>();
    const emit = (next: Partial<Snapshot>) => {
      snapshot = { ...snapshot, ...next };

      for (const listener of listeners) listener();
    };
    const run = async (
      href: string,
      body?: FormData,
      operation: OperationOptions = {},
    ): Promise<Result> => {
      controller?.abort();

      const current = new AbortController();
      controller = current;
      pending.add(current);

      const url = internalURL(main.getSnapshot().url, href);
      const match = url && matchRoutes(routes, url.pathname);
      const commit = () => {
        if (local || !url) return;

        if (browser && (operation.push || body) && snapshot.url !== url.href)
          window.history[operation.replace ? "replaceState" : "pushState"](
            null,
            "",
            url,
          );
        snapshot = {
          ...snapshot,
          url: url.href,
          path: match?.route.path,
          params: match?.params ?? {},
          ...(url.href !== snapshot.url && {
            actionData: undefined,
            data: undefined,
          }),
        };
      };

      if (!body) commit();
      emit({ state: body ? "submitting" : "loading", error: undefined });

      const result = await safeWrapAsync(() => {
        if (!url) return new Error("External URL");

        if (!match) return new Error("No route");

        const fn =
          (!options.server &&
            match.route[body ? "clientAction" : "clientLoader"]) ||
          match.route[body ? "action" : "loader"];

        if (body && !fn) return new Error("No action");

        return (fn as DataFunction | undefined)?.({
          request: new Request(url, {
            signal: current.signal,
            headers: options.request?.headers,
            ...(body && { method: operation.method ?? "POST", body }),
          }),
          params: match.params,
          signal: current.signal,
        });
      });
      pending.delete(current);

      if (current.signal.aborted) return result;

      const redirectTo =
        result.data instanceof Response && result.data.headers.get("Location");

      if (redirectTo && (operation.hops ?? 0) < 10) {
        await main.load(new URL(redirectTo, url!).href, undefined, {
          push: true,
          replace: true,
          hops: (operation.hops ?? 0) + 1,
        });

        if (local) emit({ state: "idle" });

        return result;
      }

      if (redirectTo) result.error = new Error("Redirect loop");

      if (body && !result.error) commit();

      const key = body && !local ? "actionData" : "data";
      emit({
        [key]: result.data,
        error: result.error,
        state: body && local && !result.error ? "loading" : "idle",
      });

      if (body && !result.error) {
        await router.revalidate("action", {
          formMethod: operation.method ?? "POST",
          formAction: url!.href,
          formData: body,
          actionResult: result.data,
        });

        if (local && !current.signal.aborted) emit({ state: "idle" });
      }

      return result;
    };

    return {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);

        return () => {
          listeners.delete(listener);
        };
      },
      load: run,
      submit: run,
      dispose() {
        controller?.abort();
        listeners.clear();
      },
    };
  };
  const main = channel(initial);
  let started = 0;
  let initialized = options.hydrationData?.data !== undefined;
  const pop = () => {
    void main.load(window.location.href);
  };
  const router: Router = {
    ...main,
    routes,
    start() {
      if (started++ === 0 && browser) window.addEventListener("popstate", pop);

      if (!initialized) {
        initialized = true;
        void main.load(initial.url);
      }

      return () => {
        if (--started === 0 && browser)
          window.removeEventListener("popstate", pop);
      };
    },
    async navigate(url, operation = {}) {
      initialized = true;
      await main.load(url, undefined, { ...operation, push: true });
    },
    async revalidate(reason = "manual", context = {}) {
      const url = new URL(main.getSnapshot().url);

      if (
        matchRoutes(routes, url.pathname)?.route.shouldRevalidate?.({
          ...context,
          url,
          currentUrl: url,
          nextUrl: url,
          defaultShouldRevalidate: true,
          reason,
        }) === false
      )
        return;
      await main.load(url.href);
    },

    createFetcher() {
      return channel({ ...initial, data: undefined }, true);
    },

    dispose() {
      main.dispose();

      for (const controller of pending) controller.abort();
      pending.clear();

      if (browser) window.removeEventListener("popstate", pop);
    },
  };

  return router;
}
