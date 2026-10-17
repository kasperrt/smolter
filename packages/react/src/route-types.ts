import type {
  DataArgs,
  RevalidationArgs,
  Route,
  Snapshot,
} from "@smolter/core";
import type { DataResponse } from "@smolter/core/responses";
import type { ComponentType, ReactNode } from "./runtime.ts";

/** Request, route parameters and cancellation signal supplied to a loader. */
export interface LoaderFunctionArgs extends DataArgs {
  context?: unknown;
}

/** Request, route parameters and cancellation signal supplied to an action. */
export type ActionFunctionArgs = LoaderFunctionArgs;

/** Loader arguments with a serverLoader callback for the server transport. */
export interface ClientLoaderFunctionArgs extends LoaderFunctionArgs {
  serverLoader: <T = unknown>() => Promise<T>;
}

/** Action arguments with a serverAction callback for the server transport. */
export interface ClientActionFunctionArgs extends LoaderFunctionArgs {
  serverAction: <T = unknown>() => Promise<T>;
}

/** Navigation or mutation context used to decide whether loader data should refresh. */
export type ShouldRevalidateFunctionArgs = RevalidationArgs;

type UnwrapData<T> = T extends DataResponse<infer V> ? V : T;

/** Infer successful loader data, unwrapping promises and data responses. */
export type RouteData<T> = T extends (...args: never[]) => infer R
  ? UnwrapData<Exclude<Awaited<R>, Response | Error>>
  : T;

/** A document metadata descriptor, such as a title, meta tag or structured-data record. */
export type MetaDescriptor = Record<string, unknown>;

/** Loader data, error, parameters and location supplied to a route metadata function. */
export interface MetaArgs<T> {
  data: RouteData<T> | undefined;
  loaderData: RouteData<T> | undefined;
  error?: unknown;
  params: Record<string, string>;
  location: URL;
}

/** Derive document metadata descriptors from the current route data and location. */
export type MetaFunction<T = unknown> = (args: MetaArgs<T>) => MetaDescriptor[];

/** Return link descriptors rendered in the document head. */
export type LinksFunction = () => Record<string, string>[];

/** Data route with optional lazy component, preload and document metadata integration. */
export interface AppRoute extends Route {
  resolveComponent?: () => ComponentType | undefined;
  preload?: () => Promise<void>;
  id?: string;
  routePath?: string;
  meta?: MetaFunction;
}

/** Root document components, loader, metadata and revalidation policy for a React application. */
export interface RootModule {
  /** Route identity used by targeted revalidation. Defaults to root. */
  id?: string;
  /** Optional registered route URL used to revalidate root data after mutations. */
  loaderPath?: string;
  ErrorBoundary?: ComponentType;
  default: ComponentType;
  Layout: ComponentType<{ children: ReactNode }>;
  loader?: (args: LoaderFunctionArgs) => unknown;
  links?: LinksFunction;
  meta?: MetaFunction;
  shouldRevalidate?: (args: RevalidationArgs) => boolean;
}

/** Serialized root data and route snapshot used to hydrate without repeating initial loaders. */
export interface Hydration {
  rootError?: boolean;
  root: unknown;
  snapshot: Snapshot;
}

/** Transform a data transport response using the current request context. */
export type HandleDataRequestFunction = (
  response: Response,
  args: LoaderFunctionArgs,
) => Response | Promise<Response>;
