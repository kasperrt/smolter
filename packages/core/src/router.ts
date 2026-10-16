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

type ChannelSnapshot = Partial<Snapshot> & Pick<Snapshot, "state">;

interface OperationOptions extends SubmitOptions, NavigateOptions {
  hops?: number;
}

/** Create an isolated router. Use browser: true for browser history, or loadRouter for SSR. */
export function createRouter(
  routes: readonly Route[],
  options: RouterOptions = {},
): Router {
  const browser = options.browser && typeof window !== "undefined";
  let initialized = options.hydrationData?.state === "idle";
  const initial: Snapshot = {
    loaded: initialized,
    ...(options.hydrationData ?? {
      url: new URL(
        options.url ?? (browser ? location.href : "/"),
        "http://localhost",
      ).href,
      params: {},
      state: "idle",
    }),
  };
  const disposers = new Set<() => void>();
  const channel = <S extends ChannelSnapshot>(initial: S, local = false) => {
    let snapshot = initial;
    let controller: AbortController | undefined;
    const listeners = new Set<() => void>();
    const dispose = () => {
      disposers.delete(dispose);
      controller?.abort();
      listeners.clear();
    };
    const emit = (next: Partial<Snapshot>) => {
      snapshot = { ...snapshot, ...next };

      for (const listener of listeners) listener();
    };
    const run = async (
      href: string,
      body?: FormData,
      operation: OperationOptions = {},
      // true pushes history; false handles popstate; undefined is a data request.
      navigation?: boolean,
    ): Promise<Result> => {
      controller?.abort();

      controller = new AbortController();

      const { signal } = controller;
      disposers.add(dispose);

      const previous = snapshot;
      const url = internalURL(main.getSnapshot().url, href);
      const match = url && matchRoutes(routes, url.pathname);
      const commit = () => {
        if (local || !url) return;

        const changed = snapshot.url !== url.href;

        if (!changed && snapshot.path !== undefined) return;

        if (browser && (navigation || body) && changed)
          history[operation.replace ? "replaceState" : "pushState"](
            null,
            "",
            url,
          );
        const sameRoute = snapshot.path === match?.route.path;

        snapshot = {
          ...snapshot,
          url: url.href,
          path: match?.route.path,
          params: match?.params ?? {},
          actionData: undefined,
          data: sameRoute ? snapshot.data : undefined,
          loaded: sameRoute && snapshot.loaded,
        };
      };

      if (!body) commit();
      emit({ state: body ? "submitting" : "loading", error: undefined });

      const result = await safeWrapAsync(() => {
        if (!match) return new Error(url ? "No route" : "External URL");

        if (
          navigation !== undefined &&
          !body &&
          previous.loaded &&
          !previous.error &&
          previous.path === match.route.path &&
          match.route.shouldRevalidate?.({
            url,
            currentUrl: new URL(previous.url!),
            nextUrl: url,
            defaultShouldRevalidate: true,
            reason: "navigation",
          }) === false
        )
          return previous.data;

        const fn =
          match.route[body ? "clientAction" : "clientLoader"] ||
          match.route[body ? "action" : "loader"];

        if (!fn) return body && new Error("No action");

        return (fn as DataFunction)({
          request: new Request(url, {
            signal,
            method: body && (operation.method ?? "POST"),
            body,
          }),
          params: match.params,
          signal,
        });
      });

      if (signal.aborted) return result;

      const redirectTo =
        result.data instanceof Response && result.data.headers.get("Location");

      if (redirectTo && (operation.hops ?? 0) < 10) {
        await main.load(
          new URL(redirectTo, url!).href,
          undefined,
          {
            replace: true,
            hops: (operation.hops ?? 0) + 1,
          },
          true,
        );

        if (!signal.aborted) emit({ state: "idle" });

        return result;
      }

      if (redirectTo) result.error = new Error("Redirect loop");

      if (body && !result.error) commit();

      emit({
        [body && !local ? "actionData" : "data"]: result.data,
        error: result.error,
        loaded: body ? snapshot.loaded : !result.error,
        state: body && !result.error ? "loading" : "idle",
      });

      if (body && !result.error) {
        await router.revalidate("action", {
          formMethod: operation.method ?? "POST",
          formAction: url!.href,
          formData: body,
          actionResult: result.data,
        });

        if (!signal.aborted) emit({ state: "idle" });
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
      dispose,
    };
  };
  const main = channel(initial);
  let started = 0;
  const pop = () => {
    void main.load(location.href, undefined, undefined, false);
  };
  const router: Router = {
    ...main,
    routes,
    start() {
      if (!started++ && browser) addEventListener("popstate", pop);

      if (!initialized) {
        initialized = true;
        void main.load(initial.url);
      }

      return () => {
        if (!--started && browser) removeEventListener("popstate", pop);
      };
    },
    async navigate(url, operation) {
      initialized = true;
      await main.load(url, undefined, operation, true);
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
      return channel({ state: "idle" }, true);
    },

    dispose() {
      main.dispose();

      for (const dispose of disposers) dispose();

      if (browser) removeEventListener("popstate", pop);
    },
  };

  return router;
}
