/**
 * Optional nested route rendering and per-layout data scopes.
 * @module
 */
import { matchRoutes, type Router, type Snapshot } from "@smolter/core";
import { connectNavigation } from "@smolter/core/navigation";
import {
  type BranchData,
  type BranchError,
  type NestedRoute as CoreNestedRoute,
  createNestedRouter as createBranchRouter,
  type NestedRouterOptions,
} from "@smolter/core/nested";
import { pendingLocation, retainRoute } from "@smolter/core/presentation";
import {
  type Submission,
  type SubmissionOptions,
  submitValue,
} from "@smolter/core/submission";
import { Component } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter, useSnapshot } from "./context.ts";
import {
  type FetcherSubmitOptions,
  type TypedFetcher,
  useFetcher as useFlatFetcher,
} from "./fetcher.ts";
import { Form as FlatForm, type FormProps } from "./form.ts";
import type { ActionData, LoaderData } from "./hooks.ts";
import type { MetaFunction, RouteData } from "./route-types.ts";
import type { ErrorProps } from "./routes.ts";
import {
  type ComponentType,
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "./runtime.ts";

export * from "./index.ts";
/** A nested route module with client document metadata. */
export interface NestedRoute extends CoreNestedRoute {
  meta?: MetaFunction;
}
/** Create client-side nested routing with persistent layout ownership. */
export function createNestedRouter(
  routes: readonly NestedRoute[],
  options: NestedRouterOptions = {},
): Router {
  const router = createBranchRouter(routes, options);
  retainRoute(router, flushSync);
  if (options.browser) connectNavigation(router);
  return router;
}

interface BranchRoute extends NestedRoute {
  branch: NestedRoute[];
}
interface Scope {
  branch: NestedRoute[];
  data?: BranchData;
  error?: Error;
  boundary: number;
  depth: number;
  snapshot: Snapshot;
}
const OutletContext = createContext<unknown>(undefined);
interface OutletProps {
  context?: unknown;
  children?: ReactNode;
}
/** Read the nearest parent outlet context. */
export function useOutletContext<T>(): T {
  return useContext(OutletContext) as T;
}
const Context = createContext<Scope | undefined>(undefined);

/** Render the matched layout chain under the ordinary RouterProvider. */
export function NestedRoutes(): ReactNode {
  const router = useRouter<Router>();
  const snapshot = useSnapshot();
  const route = router.routes.find((item) => item.path === snapshot.path) as
    | BranchRoute
    | undefined;
  if (!route) return snapshot.error?.message ?? null;
  const failure = snapshot.error as BranchError | undefined;
  const branch = route.branch;
  let boundary = failure
    ? branch.findIndex((node) => node.id === failure.routeId)
    : -1;
  if (failure && boundary < 0) boundary = branch.length - 1;
  while (boundary > 0 && !branch[boundary].ErrorBoundary) boundary--;
  const scope: Scope = {
    branch,
    data: failure?.branch ?? (snapshot.data as BranchData | undefined),
    error: failure,
    boundary,
    depth: -1,
    snapshot,
  };
  return createElement(
    Context.Provider,
    { value: scope },
    createElement(Meta, {}),
    createElement(Outlet, {}),
  );
}

/** Render a child layout without remounting ancestors shared by both branches. */
export function Outlet({ context }: OutletProps): ReactNode {
  const scope = useContext(Context);
  const inherited = useContext(OutletContext);
  if (!scope) return createElement(NestedRoutes, {});
  const depth = scope.depth + 1;
  const node = scope.branch[depth];
  if (!node || (scope.boundary >= 0 && depth > scope.boundary)) return null;
  const key =
    scope.boundary === depth
      ? "ErrorBoundary"
      : !scope.data &&
          scope.snapshot.state === "loading" &&
          (node.clientLoader || node.loader)
        ? "HydrateFallback"
        : "default";
  const Component = node[key] as ComponentType<ErrorProps> | undefined;
  const content = Component
    ? createElement(Component, { error: scope.error! })
    : scope.boundary === depth
      ? scope.error?.message
      : createElement(Outlet, {});
  return createElement(
    Context.Provider,
    { key: node.id, value: { ...scope, depth } },
    createElement(
      OutletContext.Provider,
      { value: context ?? inherited },
      node.ErrorBoundary
        ? createElement(RenderBoundary, {
            scope: { ...scope, depth },
            children: content,
          })
        : content,
    ),
  );
}

/** Read the current layout's loader value rather than the leaf's value. */
export function useLoaderData<T = unknown>(): LoaderData<T> {
  const scope = useContext(Context)!;
  return scope.data?.values[scope.branch[scope.depth].id] as LoaderData<T>;
}

/** Read the active branch's action result. */
export function useActionData<T = unknown>(): ActionData<T> | undefined {
  return useSnapshot("actionData") as ActionData<T> | undefined;
}

/** Read a matched ancestor's loader value by its generated route ID. */
export function useRouteLoaderData<T = unknown>(
  id: string,
): LoaderData<T> | undefined {
  return useContext(Context)?.data?.values[id] as LoaderData<T> | undefined;
}

interface MatchesOptions {
  pending?: boolean;
}
/** Read active layouts, or the pending destination's handles while loading. */
export function useMatches(options: MatchesOptions = {}): {
  id: string;
  data: unknown;
  params: import("@smolter/core").Params;
  handle: unknown;
}[] {
  const scope = useContext(Context)!;
  const router = useRouter<Router>();
  useSnapshot();
  const location = options.pending && pendingLocation(router);
  const match = location
    ? matchRoutes(router.routes, location.pathname)
    : undefined;
  const branch =
    (match?.route as BranchRoute | undefined)?.branch ?? scope.branch;
  return branch.map((route) => ({
    id: route.id,
    data: scope.data?.values[route.id],
    params: match ? match.params : scope.snapshot.params,
    handle: route.handle,
  }));
}

/** Keep SPA document metadata owned by the deepest matched metadata module. */
function Meta(): ReactNode {
  const scope = useContext(Context)!;
  const route = [...scope.branch].reverse().find((node) => node.meta);
  const data = route && scope.data?.values[route.id];
  const values =
    route?.meta?.({
      data,
      loaderData: data,
      params: scope.snapshot.params,
      error: scope.error,
      location: new URL(scope.snapshot.url),
    }) ?? [];
  useEffect(() => {
    const title = values.find((item) => typeof item.title === "string")?.title;
    if (typeof title === "string") document.title = title;
  }, [values]);
  if (typeof document === "undefined") return null;
  return createPortal(
    values.map((item, key) => {
      if (typeof item.title === "string")
        return createElement("title", { key }, item.title);
      const { tagName, ...props } = item;
      return createElement(tagName === "link" ? "link" : "meta", {
        ...props,
        key,
      });
    }),
    document.head,
  );
}

/** Read a loader or action failure at its owning boundary. */
export function useRouteError(): Error | undefined {
  return useContext(Context)?.error;
}

function useDefaultAction() {
  const scope = useContext(Context)!;
  const node = scope.branch[scope.depth];
  const url = new URL(scope.snapshot.url);
  url.pathname = node.path
    .replace(/:([^/]+)/g, (_match, name: string) =>
      encodeURIComponent(scope.snapshot.params[name] ?? ""),
    )
    .replace("*", scope.snapshot.params["*"] ?? "");
  url.searchParams.delete("index");
  if (node.index) url.searchParams.append("index", "");
  return url.href;
}

/** Default form submissions target the owning layout, including index routes. */
export function Form(props: FormProps): ReactNode {
  const action = useDefaultAction();
  return createElement(FlatForm, { action, ...props });
}

/** Fetchers retain their existing lifecycle and default to their owning route. */
export function useFetcher<T = unknown>(): TypedFetcher<RouteData<T>> {
  const fetcher = useFlatFetcher<T>();
  const action = useDefaultAction();
  const BoundForm = fetcher.Form;
  const Form = useMemo(
    () =>
      function ScopedForm(props: FormProps) {
        const action = useDefaultAction();
        return createElement(BoundForm, { action, ...props });
      },
    [BoundForm],
  );
  return {
    ...fetcher,
    Form,
    load: (url = action) => fetcher.load(url),
    submit: (body: Submission, options?: FetcherSubmitOptions) =>
      fetcher.submit(body, { action, ...options }),
  };
}

interface RenderBoundaryProps {
  scope: Scope;
  children: ReactNode;
}
interface RenderBoundaryState {
  error?: Error;
  revision?: unknown;
}
class RenderBoundary extends Component<
  RenderBoundaryProps,
  RenderBoundaryState
> {
  override state: RenderBoundaryState = {};
  static getDerivedStateFromProps(
    { scope }: RenderBoundaryProps,
    state: RenderBoundaryState,
  ) {
    const revision = scope.snapshot.data ?? scope.snapshot.url;
    if (state.revision !== revision) return { revision, error: undefined };
    return null;
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    const { scope, children } = this.props;
    const { error } = this.state;
    if (!error) return children;
    const Boundary = scope.branch[scope.depth]
      .ErrorBoundary as ComponentType<ErrorProps>;
    return createElement(
      Context.Provider,
      { value: { ...scope, error } },
      createElement(Boundary, { error }),
    );
  }
}

/** Submit imperatively to the current layout when no explicit action is supplied. */
export function useSubmit(): (
  value: Submission,
  options?: SubmissionOptions,
) => Promise<void> | Promise<import("@smolter/core").Result<unknown>> {
  const router = useRouter<Router>();
  const action = useDefaultAction();
  return (value: Submission, options?: SubmissionOptions) =>
    submitValue(router, value, { action, ...options });
}
