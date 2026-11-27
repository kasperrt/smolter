/**
 * Framework-independent route matching, data requests, and state.
 * @module
 */

/** Framework-independent data routing. No global request state. */
export type Params = Record<string, string>;

/** Request, path parameters, and cancellation signal passed to a data handler. */
export interface DataArgs {
  /** Revalidation context supplied to composed layout loaders. */
  revalidation?: RevalidationArgs;
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
  /** Explicitly selected layout or route identities; omitted for a full refresh. */
  targets?: readonly string[];
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
  url: URL;
  reason: "manual" | "action" | "navigation";
}

/** Departure options for viewTransition's commit; in-document commits ignore them. */
export interface CommitOptions {
  /** Keep the browser's cross-document view transition into the destination, with these types on the leaving document; [] adds none. */
  crossDocument?: readonly string[];
}

/** A route component and its optional server and client data handlers. */
export interface RouteModule {
  /** Consumer-owned route presentation, entering or leaving the document. Call commit once; stale commits are ignored. */
  viewTransition?: (
    commit: (options?: CommitOptions) => void,
    previous: Snapshot,
    next: Snapshot,
  ) => void;
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
export type Route<M extends RouteModule = RouteModule> = M & {
  path: string;
  revalidationIds?: readonly string[];
};

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
  formData?: FormData;
  error?: Error;
  state: "idle" | "loading" | "submitting";
  /** Set on viewTransition's next snapshot when navigation leaves this document; commit performs the browser navigation. */
  leaving?: true;
}

/** Context for one route discovery request. */
export interface RouteDiscoveryContext {
  signal: AbortSignal;
  /** True when a page navigation asked; a stale build may then reload the document. */
  navigation: boolean;
}

/** Resolve authorized route definitions for a URL no known route matches. Return none when unknown or denied. */
export type RouteResolver<R extends Route = Route> = (
  url: URL,
  context: RouteDiscoveryContext,
) => Promise<readonly R[]>;

/** Router methods added when route discovery is configured. */
export interface DiscoveryMethods {
  discover: (href: string) => Promise<boolean>;
  resetDiscovery: () => void;
}

/** Discovery state attached to one router's route table. */
export interface DiscoveryTable {
  /** Whether no route, or only a splat, matches the URL. */
  needs: (url: URL) => boolean;
  load: (url: URL, navigation: boolean) => Promise<boolean>;
  methods: DiscoveryMethods;
  dispose: () => void;
}

/** Route discovery for a router. Create it with withRouteDiscovery or routeDiscoveryClient; routers without it carry no discovery code. */
export interface RouteDiscovery<R extends Route = Route> {
  attach: (
    table: Route[],
    host: DiscoveryHost,
    cache?: DiscoveryCache,
    transform?: (routes: readonly R[]) => readonly Route[],
  ) => DiscoveryTable;
}

/** The router channel whose current URL resolves discovery requests. */
export interface DiscoveryHost {
  getSnapshot: () => Pick<Snapshot, "url">;
}

/** Data cleared when discovery resets, such as speculative route data. */
export interface DiscoveryCache {
  clear: () => void;
}

/** Initial URL, browser history, hydration and route discovery configuration. */
export interface RouterOptions {
  url?: string;
  /** Explicitly opt into browser history; leave off for SSR and tests. */
  browser?: boolean;
  hydrationData?: Snapshot;
  /** Ask the server for routes that are not in the public route table. */
  discover?: RouteDiscovery;
}

/** Options for replacing rather than appending a browser history entry. */
export interface NavigateOptions {
  state?: unknown;
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
  formData?: FormData;
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
  /** With route discovery: discover routes for an unmatched URL. Resolves true when a route now matches it. */
  discover?: (url: string) => Promise<boolean>;
  /** With route discovery: forget discovered routes and denials, for example after logout or a permission change. */
  resetDiscovery?: () => void;
  dispose: () => void;
}

/** Statically known capabilities of a discovered route module. */
export interface DiscoveredCapabilities {
  dataEndpoint?: string;
  loader?: boolean;
  action?: boolean;
  clientAction?: boolean;
  meta?: boolean;
  shouldRevalidate?: boolean;
  ErrorBoundary?: boolean;
}

/** Browser definition of one authorized route, as returned by route discovery. */
export interface DiscoveredRoute {
  path: string;
  id?: string;
  parentId?: string;
  index?: boolean;
  pathless?: boolean;
  capabilities: DiscoveredCapabilities;
  /** Module URL of the route's browser chunk. */
  file: string;
  /** Browser exports selected from the module. */
  exports: string[];
  /** Stylesheet URLs to load before the module renders. */
  styles: string[];
}

/** Route discovery response; build ties routes to one deployment. */
export interface RouteDiscoveryResponse {
  build: string;
  routes: DiscoveredRoute[];
}
