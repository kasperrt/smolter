import type {
  DataArgs,
  RevalidationArgs,
  Route,
  Snapshot,
} from "@smolter/core";
import type { DataResponse } from "@smolter/core/responses";
import type { ComponentType, ReactNode } from "preact/compat";

export interface LoaderFunctionArgs extends DataArgs {
  context?: unknown;
}

export type ActionFunctionArgs = LoaderFunctionArgs;

export interface ClientLoaderFunctionArgs extends LoaderFunctionArgs {
  serverLoader: <T = unknown>() => Promise<T>;
}

export interface ClientActionFunctionArgs extends LoaderFunctionArgs {
  serverAction: <T = unknown>() => Promise<T>;
}

export type ShouldRevalidateFunctionArgs = RevalidationArgs;

type UnwrapData<T> = T extends DataResponse<infer V> ? V : T;

export type RouteData<T> = T extends (...args: never[]) => infer R
  ? UnwrapData<Exclude<Awaited<R>, Response | Error>>
  : T;

export type MetaDescriptor = Record<string, unknown>;

export interface MetaArgs<T> {
  data: RouteData<T> | undefined;
  loaderData: RouteData<T> | undefined;
  error?: unknown;
  params: Record<string, string>;
  location: URL;
}

export type MetaFunction<T = unknown> = (args: MetaArgs<T>) => MetaDescriptor[];

export type LinksFunction = () => Record<string, string>[];

export interface AppRoute extends Route {
  resolveComponent?: () => ComponentType | undefined;
  preload?: () => Promise<void>;
  id?: string;
  routePath?: string;
  meta?: MetaFunction;
}

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

export interface Hydration {
  root: unknown;
  snapshot: Snapshot;
}

export type HandleDataRequestFunction = (
  response: Response,
  args: LoaderFunctionArgs,
) => Response | Promise<Response>;
