/**
 * Framework-independent route matching, data requests, and state.
 * @module
 */

/** Framework-independent data routing. No global request state. */
export type Params = Record<string, string>;

/** Request, path parameters, and cancellation signal passed to a data handler. */
export interface DataArgs {
  request: Request;
  params: Params;
  signal: AbortSignal;
}

/** A loader or action that returns data, a Response, or an Error value. */
export type DataFunction = (args: DataArgs) => unknown;

/** A handler signature used to infer data from specialized loader and action arguments. */
export type AnyDataFunction = (...args: never[]) => unknown;

/** Client loader arguments, including a typed call to the server loader. */
export interface ClientLoaderArgs<L extends AnyDataFunction = DataFunction>
  extends DataArgs {
  serverLoader: () => Promise<DataOf<L>>;
}

/** Client action arguments, including a typed call to the server action. */
export interface ClientActionArgs<A extends AnyDataFunction = DataFunction>
  extends DataArgs {
  serverAction: () => Promise<DataOf<A>>;
}

/** The resolved data returned by a handler, excluding Error values. */
export type DataOf<F> = F extends AnyDataFunction
  ? Exclude<Awaited<ReturnType<F>>, Error>
  : undefined;

/** Mutation details supplied when deciding whether to reload route data. */
export interface RevalidationContext {
  formMethod?: string;
  formAction?: string;
  formData?: FormData;
  actionResult?: unknown;
}

/** Current URL, mutation result, and reason passed to shouldRevalidate. */
export interface RevalidationArgs extends RevalidationContext {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
  url: URL;
  reason: "manual" | "action";
}

/** A route component and its optional server and client data handlers. */
export interface RouteModule {
  default?: unknown;
  HydrateFallback?: unknown;
  ErrorBoundary?: unknown;
  loader?: DataFunction;
  action?: DataFunction;
  clientLoader?(args: ClientLoaderArgs): unknown;
  clientAction?(args: ClientActionArgs): unknown;
  shouldRevalidate?: (args: RevalidationArgs) => boolean;
}

/** A route module associated with an explicit URL pattern. */
export type Route<M extends RouteModule = RouteModule> = M & { path: string };

/** Associate a URL pattern with a module while retaining its inferred handler types. */
export function defineRoute<const M extends RouteModule>(
  path: string,
  module: M,
): Route<M> {
  return { ...module, path };
}

/** The first matching route and its decoded path parameters. */
export interface Match {
  route: Route;
  params: Params;
}
/** Static segments, :params and a terminal * wildcard; first match wins. */
export function matchRoutes(
  routes: readonly Route[],
  pathname: string,
): Match | undefined {
  const segments = pathname.replace(/\/$/, "").split("/");

  for (const route of routes) {
    const parts = route.path.replace(/\/$/, "").split("/");
    const params: Params = {};
    const matched = parts.every((part, index) => {
      const value = segments[index];

      if (part === "*") {
        params["*"] = segments.slice(index).join("/");

        return true;
      }

      if (part.startsWith(":") && value) {
        params[part.slice(1)] = new URLSearchParams(
          `v=${value.replace(/\+/g, "%2B")}`,
        ).get("v")!;

        return true;
      }

      return part === value;
    });

    if (matched && (parts.at(-1) === "*" || parts.length === segments.length))
      return { route, params };
  }
}

/** Immutable current route state observed by framework hooks. */
export interface Snapshot {
  url: string;
  path?: string;
  params: Params;
  data: unknown;
  actionData: unknown;
  error?: Error;
  state: "idle" | "loading" | "submitting";
}

/** Initial URL, server request, browser history, and hydration configuration. */
export interface RouterOptions {
  url?: string;
  /** Skip browser-only handlers during server rendering. Set by loadRouter. */
  server?: boolean;
  /** Incoming server request headers are forwarded to data handlers. */
  request?: Request;
  /** Explicitly opt into browser history; leave off for SSR and tests. */
  browser?: boolean;
  hydrationData?: Snapshot;
}

/** Options for replacing rather than appending a browser history entry. */
export interface NavigateOptions {
  replace?: boolean;
}

/** HTTP method for a route action submission; defaults to POST. */
export interface SubmitOptions {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
}

/** A resolved operation result, with either data or a normalized Error. */
export interface Result<T = unknown> {
  data?: T;
  error?: Error;
}

/** Independent fetcher data, error, and pending state. */
export interface FetcherSnapshot extends Result {
  state: Snapshot["state"];
}

/** An independent loader/action channel that does not navigate the page. */
export interface Fetcher {
  getSnapshot: () => FetcherSnapshot;
  subscribe: (listener: () => void) => () => void;
  load: (url: string) => Promise<Result>;
  submit: (
    url: string,
    body: FormData,
    options?: SubmitOptions,
  ) => Promise<Result>;
  dispose: () => void;
}

/** Route navigation, subscriptions, fetchers, and loader revalidation. */
export interface Router {
  routes: readonly Route[];
  getSnapshot: () => Snapshot;
  subscribe: (listener: () => void) => () => void;
  start: () => () => void;
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  revalidate: (
    reason?: RevalidationArgs["reason"],
    context?: RevalidationContext,
  ) => Promise<void>;
  submit: (
    url: string,
    body: FormData,
    options?: SubmitOptions,
  ) => Promise<Result>;
  createFetcher: () => Fetcher;
  dispose: () => void;
}

/** Resolve returned or rejected errors into Error values without losing their cause. */
export function safeWrapAsync<T>(
  work: () => T | Promise<T>,
): Promise<Result<T>> {
  return Promise.resolve()
    .then(work)
    .then(
      (data) => (data instanceof Error ? { error: data } : { data }),
      (cause: unknown) => ({ error: new Error(String(cause), { cause }) }),
    );
}

interface OperationOptions extends SubmitOptions, NavigateOptions {
  push?: boolean;
  hops?: number;
}

/** Resolve an internal URL; external links remain the browser's responsibility. */
export function internalURL(base: string, href: string): URL | undefined {
  const origin = new URL(base);
  const url = new URL(href, origin);

  if (url.origin === origin.origin) return url;
}

/** Create an isolated router. Use browser: true for browser history, or loadRouter for SSR. */
export function createRouter(
  routes: readonly Route[],
  options: RouterOptions = {},
): Router {
  const browser = options.browser && typeof window !== "undefined";
  const initialUrl = new URL(
    options.url ?? (browser ? window.location.href : "/"),
    "http://localhost",
  ).href;
  const initial: Snapshot = options.hydrationData ?? {
    url: initialUrl,
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

      const result = await safeWrapAsync(async () => {
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

      if (redirectTo) {
        if ((operation.hops ?? 0) >= 10)
          result.error = new Error("Redirect loop");

        if (!result.error) {
          await main.load(new URL(redirectTo, url!).href, undefined, {
            push: true,
            replace: true,
            hops: (operation.hops ?? 0) + 1,
          });

          if (local) emit({ state: "idle" });

          return result;
        }
      }

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
