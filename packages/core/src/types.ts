/**
 * Framework-independent route matching, data requests, and state.
 * @module
 */

/** Framework-independent data routing. No global request state. */
export type Params = Record<string, string>;

/** Request, path parameters, and cancellation signal passed to a data handler. */
export interface DataArgs {
  /** Why this handler ran; independent of when browser history is committed. */
  reason?:
    | "initial"
    | "navigation"
    | "revalidation"
    | "fetcher"
    | "action"
    | "prefetch";
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
  reason: "manual" | "action" | "navigation";
}

/** A route component and its optional server and client data handlers. */
export interface RouteModule {
  /** Stable identifier for targeted revalidation; defaults to the path. */
  id?: string;
  default?: unknown;
  HydrateFallback?: unknown;
  ErrorBoundary?: unknown;
  loader?: DataFunction;
  action?: DataFunction;
  /** Browser read: await the top-level result, retaining nested promises for deferred UI. */
  clientLoader?(args: ClientLoaderArgs): unknown;
  clientAction?(args: ClientActionArgs): unknown;
  shouldRevalidate?: (args: RevalidationArgs) => boolean;
}

/** A route module associated with an explicit URL pattern. */
export type Route<M extends RouteModule = RouteModule> = M & { path: string };

/** The first matching route and its decoded path parameters. */
export interface Match {
  route: Route;
  params: Params;
}
/** Immutable current route state observed by framework hooks. */
export interface Snapshot {
  url: string;
  path?: string;
  params: Params;
  data?: unknown;
  /** Whether this route has completed a loader, including an undefined result. */
  loaded?: boolean;
  actionData?: unknown;
  error?: Error;
  state: "idle" | "loading" | "submitting";
}

/** Initial URL, browser history, and hydration configuration. */
export interface RouterOptions {
  url?: string;
  /** Explicitly opt into browser history; leave off for SSR and tests. */
  browser?: boolean;
  hydrationData?: Snapshot;
}

/** Options for replacing rather than appending a browser history entry. */
export interface NavigateOptions {
  state?: unknown;
  viewTransition?: boolean;
  replace?: boolean;
  /** Preserve scroll in integrations that manage scroll restoration. */
  preventScrollReset?: boolean;
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
  /** Abort work and release subscriptions when this imperative fetcher is no longer used. */
  dispose: () => void;
}

/** Refresh active route data without navigation, optionally selecting route IDs or paths. */
export interface RevalidateOptions extends RevalidationContext {
  route?: string | readonly string[];
  reason?: RevalidationArgs["reason"];
}

/** A registered layout loader's revalidation callback. */
export type Revalidator = (args: RevalidationArgs) => void | Promise<void>;

/** Route navigation, subscriptions, fetchers, and loader revalidation. */
export interface Router {
  routes: readonly Route[];
  getSnapshot: () => Snapshot;
  subscribe: (listener: () => void) => () => void;
  start: () => () => void;
  navigate: (url: string, options?: NavigateOptions) => Promise<void>;
  revalidate: (
    options?: RevalidateOptions | RevalidationArgs["reason"],
    context?: RevalidationContext,
  ) => Promise<void>;
  /** Register layout data under a route ID. The returned function unregisters it. */
  registerRevalidator: (id: string, revalidate: Revalidator) => () => void;
  submit: (
    url: string,
    body: FormData,
    options?: SubmitOptions,
  ) => Promise<Result>;
  /** Create an independent fetcher. Framework useFetcher hooks manage disposal automatically. */
  createFetcher: () => Fetcher;
  /** Speculatively read route data without navigation; cached for one navigation, at most 30 seconds. */
  prefetch: (url: string) => Promise<Result>;
  dispose: () => void;
}
