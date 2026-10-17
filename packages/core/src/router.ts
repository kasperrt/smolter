import { safeWrapAsync } from "./errors.ts";
import { matchRoutes } from "./match.ts";
import type {
  DataFunction,
  NavigateOptions,
  Result,
  RevalidationArgs,
  Route,
  Router,
  RouterOptions,
  Snapshot,
  SubmitOptions,
} from "./types.ts";
import { internalURL } from "./url.ts";

type ChannelSnapshot = Partial<Snapshot> & Pick<Snapshot, "state">;

interface OperationOptions extends SubmitOptions, NavigateOptions {}

interface RevalidationTask {
  revalidate: (
    args: RevalidationArgs,
    targets?: readonly string[],
  ) => Promise<unknown>;
  dispose?: () => void;
}

/** Create an isolated router. Use browser: true for browser history, or loadRouter for SSR. */
export function createDataRouter(
  routes: readonly Route[],
  options: RouterOptions = {},
): Router {
  const browser = options.browser && typeof window !== "undefined";
  const hydrated = options.hydrationData?.state === "idle";
  const initial: Snapshot = {
    loaded: hydrated,
    ...(options.hydrationData ?? {
      url: new URL(
        options.url ?? (browser ? location.href : "/"),
        "http://localhost",
      ).href,
      params: {},
      state: "idle",
    }),
  };
  const revalidators = new Set<RevalidationTask>();
  const channel = <S extends ChannelSnapshot>(initial: S, local?: boolean) => {
    let snapshot = initial;
    let loadedURL: string | undefined;
    let submission: FormData | undefined;
    let controller: AbortController | undefined;
    const listeners = new Set<() => void>();
    const emit = (state: Snapshot["state"], next?: Partial<Snapshot>) => {
      snapshot = { ...snapshot, ...next, state };

      for (const listener of listeners) listener();
    };
    const run = async (
      href: string,
      body?: FormData,
      operation: OperationOptions = {},
      // Only loader navigations set this: true pushes history; false handles popstate.
      navigation?: boolean,
      redirects = 10,
    ): Promise<Result> => {
      controller?.abort();

      controller = new AbortController();

      const { signal } = controller;
      const { method = "POST" } = operation;
      revalidators.add(task);

      submission = body;
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
          ...(!sameRoute && { data: undefined, loaded: false }),
        };
      };

      if (!body) commit();

      emit(body ? "submitting" : "loading", { error: undefined });

      const result = await safeWrapAsync(() => {
        if (!match) return Error(url ? "No route" : "External URL");

        if (
          navigation !== undefined &&
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

        if (!fn) return body && Error("No action");

        return (fn as DataFunction)({
          reason: body
            ? "action"
            : navigation !== undefined
              ? "navigation"
              : local
                ? "fetcher"
                : previous.loaded
                  ? "revalidation"
                  : "initial",
          request: new Request(url, {
            signal,
            method: body && method,
            body,
          }),
          params: match.params,
          signal,
        });
      });

      if (signal.aborted) return result;

      const redirectTo =
        result.data instanceof Response && result.data.headers.get("Location");

      if (redirectTo && redirects) {
        await main.load(
          new URL(redirectTo, url!).href,
          undefined,
          { replace: true },
          true,
          redirects - 1,
        );

        if (body) {
          const destination = new URL(main.getSnapshot().url);
          const args: RevalidationArgs = {
            url: destination,
            currentUrl: destination,
            nextUrl: destination,
            defaultShouldRevalidate: true,
            reason: "action",
            formMethod: method,
            formAction: url!.href,
            formData: body,
            actionResult: result.data,
          };

          // The destination loader just ran. Refresh root data and other fetchers
          // without loading that page twice or replaying the mutation.
          await Promise.all(
            [...revalidators]
              .filter((task) => task !== main)
              .map((task) => task.revalidate(args)),
          );
        }

        if (!signal.aborted) {
          submission = undefined;
          emit("idle");
        }

        return result;
      }

      if (redirectTo) result.error = Error("Redirect loop");

      if (!body && !result.error) loadedURL = url!.href;

      if (body && !result.error) commit();

      emit(body && !result.error ? "loading" : "idle", {
        [body && !local ? "actionData" : "data"]: result.data,
        error: result.error,
        loaded: body ? snapshot.loaded : !result.error,
      });

      if (body && !result.error) {
        await router
          .revalidate("action", {
            formMethod: method,
            formAction: url!.href,
            formData: body,
            actionResult: result.data,
          })
          .finally(() => {
            if (!signal.aborted) {
              submission = undefined;
              emit("idle");
            }
          });

        return result;
      }

      if (!signal.aborted) submission = undefined;

      return result;
    };
    const task = {
      revalidate: async (
        args: RevalidationArgs,
        targets?: readonly string[],
      ) => {
        if (local && (!loadedURL || submission)) return;

        const url = new URL(local ? loadedURL! : main.getSnapshot().url);
        const route = matchRoutes(routes, url.pathname)?.route;

        // Targets are strings, so an absent route ID cannot match one.
        if (
          !route ||
          (targets &&
            !targets.includes(route.id!) &&
            !targets.includes(route.path))
        )
          return;

        if (
          route.shouldRevalidate?.({
            ...args,
            url,
            currentUrl: url,
            nextUrl: url,
          }) === false
        )
          return;

        return run(url.href);
      },
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
        revalidators.delete(task);
      },
    };
    revalidators.add(task);

    return task;
  };
  const main = channel(initial);
  let started = 0;
  const pop = () => main.load(location.href, undefined, undefined, false);
  const router: Router = {
    ...main,
    routes,
    start() {
      if (!started++ && browser) addEventListener("popstate", pop);

      // A changed snapshot means a page operation has already started.
      if (!hydrated && main.getSnapshot() === initial)
        void main.load(initial.url);

      return () => {
        if (!--started && browser) removeEventListener("popstate", pop);
      };
    },
    async navigate(url, operation) {
      await main.load(url, undefined, operation, true);
    },
    async revalidate(options = {}, context) {
      const {
        route,
        reason = "manual",
        ...details
      } = typeof options === "string"
        ? { reason: options, ...context }
        : options;
      const url = new URL(main.getSnapshot().url);
      const args = {
        ...details,
        url,
        currentUrl: url,
        nextUrl: url,
        defaultShouldRevalidate: true,
        reason,
      };
      const targets = typeof route === "string" ? [route] : route;

      await Promise.all(
        [...revalidators].map((refresh) => refresh.revalidate(args, targets)),
      );
    },

    registerRevalidator(id, refresh) {
      const task = {
        revalidate: async (
          args: RevalidationArgs,
          targets?: readonly string[],
        ) => {
          if (!targets || targets.includes(id)) return refresh(args);
        },
      };
      revalidators.add(task);

      return () => {
        revalidators.delete(task);
      };
    },

    createFetcher() {
      return channel({ state: "idle" }, true);
    },

    dispose() {
      for (const refresh of revalidators) refresh.dispose?.();

      revalidators.clear();

      if (browser) removeEventListener("popstate", pop);
    },
  };

  return router;
}
