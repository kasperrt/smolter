/** Framework-independent data routing. No global request state. */
export type Params = Record<string, string>;
export interface DataArgs {
  request: Request;
  params: Params;
  signal: AbortSignal;
}
export type DataFunction = (args: DataArgs) => unknown;
export type DataOf<F> = F extends DataFunction
  ? Awaited<ReturnType<F>>
  : undefined;
export interface RevalidationArgs {
  url: URL;
  reason: "manual" | "action";
}
export interface RouteModule {
  default?: unknown;
  HydrateFallback?: unknown;
  ErrorBoundary?: unknown;
  loader?: DataFunction;
  action?: DataFunction;
  shouldRevalidate?: (args: RevalidationArgs) => boolean;
}
export type Route<M extends RouteModule = RouteModule> = M & { path: string };
export function defineRoute<const M extends RouteModule>(
  path: string,
  module: M,
): Route<M> {
  return { ...module, path };
}
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
    const pattern = route.path.replace(/\/$/, "").split("/");
    const params: Params = {};
    let matched = true;
    for (
      let index = 0;
      index < Math.max(pattern.length, segments.length);
      index++
    ) {
      const part = pattern[index];
      const value = segments[index];
      if (part === "*") {
        params["*"] = segments.slice(index).join("/");
        break;
      }
      if (part?.startsWith(":") && value) {
        params[part.slice(1)] =
          new URLSearchParams(`v=${value.replace(/\+/g, "%2B")}`).get("v") ??
          "";
        continue;
      }
      if (part !== value) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return undefined;
}
export interface Snapshot {
  url: string;
  path?: string;
  params: Params;
  data: unknown;
  actionData: unknown;
  error?: Error;
  state: "idle" | "loading" | "submitting";
}
export interface RouterOptions {
  url?: string;
  /** Incoming server request headers are forwarded to data handlers. */
  request?: Request;
  /** Explicitly opt into browser history; leave off for SSR and tests. */
  browser?: boolean;
  hydrationData?: Snapshot;
}
export interface NavigateOptions {
  replace?: boolean;
}
export interface SubmitOptions {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
}
export interface Result<T = unknown> {
  data?: T;
  error?: Error;
}
export interface FetcherSnapshot extends Result {
  state: Snapshot["state"];
}
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
export interface Router {
  routes: readonly Route[];
  getSnapshot: () => Snapshot;
  subscribe: (listener: () => void) => () => void;
  start: () => () => void;
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  revalidate: (reason?: RevalidationArgs["reason"]) => Promise<void>;
  submit: (
    url: string,
    body: FormData,
    options?: SubmitOptions,
  ) => Promise<Result>;
  createFetcher: () => Fetcher;
  dispose: () => void;
}
export async function safeWrapAsync<T>(
  work: () => T | Promise<T>,
): Promise<Result<T>> {
  return Promise.resolve()
    .then(work)
    .then(
      (data) => ({ data }),
      (cause: unknown) => ({ error: new Error(String(cause), { cause }) }),
    );
}
interface OperationOptions extends SubmitOptions, NavigateOptions {
  history?: boolean;
  hops?: number;
}
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
      const url = new URL(href, main.getSnapshot().url);
      const match = matchRoutes(routes, url.pathname);
      const commit = () => {
        if (local || url.origin !== new URL(snapshot.url).origin) return;
        if (browser && (operation.history || body) && snapshot.url !== url.href)
          window.history[operation.replace ? "replaceState" : "pushState"](
            null,
            "",
            url,
          );
        emit({
          url: url.href,
          path: match?.route.path,
          params: match?.params ?? {},
          ...(url.href !== snapshot.url && {
            actionData: undefined,
            data: undefined,
          }),
        });
      };
      if (!body) commit();
      emit({ state: body ? "submitting" : "loading", error: undefined });
      const result = await safeWrapAsync(async () => {
        if (url.origin !== new URL(main.getSnapshot().url).origin)
          return new Error("Cross-origin URL");
        if (!match) return new Error("No route");
        const fn = match.route[body ? "action" : "loader"];
        if (body && !fn) return new Error("No action");
        return fn?.({
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
      if (result.data instanceof Error) {
        result.error = result.data;
        result.data = undefined;
      }
      const redirectTo =
        result.data instanceof Response && result.data.headers.get("Location");
      if (redirectTo) {
        if ((operation.hops ?? 0) >= 10)
          result.error = new Error("Redirect loop");
        if (!result.error) {
          await main.run(new URL(redirectTo, url).href, undefined, {
            history: true,
            replace: true,
            hops: (operation.hops ?? 0) + 1,
          });
          if (local) emit({ state: "idle" });
          return result;
        }
      }
      if (body && !result.error) commit();
      const key = body && !local ? "actionData" : "data";
      emit({ [key]: result.data, error: result.error, state: "idle" });
      if (body && !result.error) {
        if (local) emit({ state: "loading" });
        await router.revalidate("action");
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
      run,
      dispose() {
        controller?.abort();
        listeners.clear();
      },
    };
  };
  const main = channel(initial);
  let started = 0;
  let initialized = !!options.hydrationData;
  const pop = () => {
    void main.run(window.location.href);
  };
  const router: Router = {
    routes,
    getSnapshot: main.getSnapshot,
    subscribe: main.subscribe,
    start() {
      if (started++ === 0 && browser) window.addEventListener("popstate", pop);
      if (!initialized) {
        initialized = true;
        void main.run(initial.url);
      }
      return () => {
        if (--started === 0 && browser)
          window.removeEventListener("popstate", pop);
      };
    },
    async navigate(url, operation = {}) {
      initialized = true;
      await main.run(url, undefined, { ...operation, history: true });
    },
    async revalidate(reason = "manual") {
      const url = new URL(main.getSnapshot().url);
      if (
        matchRoutes(routes, url.pathname)?.route.shouldRevalidate?.({
          url,
          reason,
        }) === false
      )
        return;
      await main.run(url.href);
    },
    submit: (url, body, operation) => main.run(url, body, operation),
    createFetcher() {
      const fetcher = channel({ ...initial, data: undefined }, true);
      return {
        getSnapshot: fetcher.getSnapshot,
        subscribe: fetcher.subscribe,
        load: fetcher.run,
        submit: fetcher.run,
        dispose: fetcher.dispose,
      };
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
