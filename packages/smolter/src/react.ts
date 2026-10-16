/**
 * React components and typed data hooks. Import from smolter/react.
 * @module
 */

// @deno-types="npm:@types/react@19.3.0"
import type {
  AnchorHTMLAttributes,
  ComponentType,
  FormHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";
// @deno-types="npm:@types/react@19.3.0"
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  AnyDataFunction,
  DataFunction,
  DataOf,
  Fetcher,
  FetcherSnapshot,
  Result,
  Route as RouteDefinition,
  RouteModule,
  Router,
  Snapshot,
  SubmitOptions,
} from "./core.ts";

import { internalURL } from "./core.ts";

export type * from "./core.ts";
export { createRouter, defineRoute } from "./core.ts";

const RouterContext = createContext<Router | undefined>(undefined);

/** Router instance and children rendered within its context. */
export interface RouterProviderProps {
  router: Router;
  children?: ReactNode;
}

/** Provide a router to descendant hooks and connect its browser lifecycle. */
export function RouterProvider({
  router,
  children,
}: RouterProviderProps): ReactNode {
  useEffect(() => router.start(), [router]);

  return createElement(RouterContext.Provider, { value: router }, children);
}
/** Hooks require a RouterProvider. */
export function useRouter(): Router {
  return useContext(RouterContext) as Router;
}

function useSnapshot(): Snapshot {
  const router = useRouter();

  return useSyncExternalStore(
    router.subscribe,
    router.getSnapshot,
    router.getSnapshot,
  );
}

/** A route module or loader function used for data inference. */
export type LoaderSource = RouteModule | AnyDataFunction;

/** Infer server and client loader data from a route module or function. */
export type LoaderData<T> = T extends AnyDataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
    : unknown;

/** Infer server and client action data from a route module or function. */
export type ActionData<T> = T extends AnyDataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
    : unknown;
function useData(key: "data" | "actionData", route?: LoaderSource): unknown {
  const snapshot = useSnapshot();

  if (route && "path" in route && route.path !== snapshot.path)
    return undefined;

  return snapshot[key];
}
/** Pass a route for inference, or use useLoaderData<typeof loader>() in its module. */
export function useLoaderData<T extends LoaderSource = RouteModule>(
  route?: T,
): LoaderData<T> | undefined {
  return useData("data", route) as LoaderData<T> | undefined;
}

/** Read the last page action result, optionally inferring its type from a route. */
export function useActionData<T extends LoaderSource = RouteModule>(
  route?: T,
): ActionData<T> | undefined {
  return useData("actionData", route) as ActionData<T> | undefined;
}

/** Read path parameters for the active route. */
export function useParams(): Snapshot["params"] {
  return useSnapshot().params;
}

/** Read the current path, search, and hash together with the navigate function. */
export function useLocation(): readonly [string, Router["navigate"]] {
  const router = useRouter();
  const snapshot = useSnapshot();

  return [snapshot.url.replace(/^\w+:\/\/[^/]+/, ""), router.navigate];
}

/** Get the function that revalidates the current loader subject to shouldRevalidate. */
export function useRevalidator(): Router["revalidate"] {
  return useRouter().revalidate;
}

/** Renderable route module with optional loading and error components. */
export interface ViewModule extends RouteModule {
  default?: ComponentType;
  HydrateFallback?: ComponentType;
  ErrorBoundary?: ComponentType<ErrorProps>;
}

/** Normalized route error supplied to an ErrorBoundary component. */
export interface ErrorProps {
  error: Error;
}

/** Fallback content used when no matching component can be rendered. */
export interface RoutesProps {
  fallback?: ReactNode;
}
/** Renders the first matching registered module. */
export function Routes({ fallback = null }: RoutesProps): ReactNode {
  const router = useRouter();
  const state = useSnapshot();
  const module = router.routes.find((route) => route.path === state.path) as
    | RouteDefinition<ViewModule>
    | undefined;
  const component = state.error
    ? module?.ErrorBoundary
    : state.state === "loading" && state.data === undefined
      ? module?.HydrateFallback
      : module?.default;

  if (component)
    return createElement(component as ComponentType<ErrorProps>, {
      error: state.error!,
    });

  return state.error?.message ?? fallback;
}

/** Anchor attributes with internal navigation and optional history replacement. */
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

/** Render an anchor that handles internal navigation and preserves native modified clicks. */
export function Link({
  href,
  replace,
  onClick,
  ...props
}: LinkProps): ReactNode {
  const router = useRouter();
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      props.download !== undefined ||
      (props.target && props.target !== "_self")
    )
      return;

    const target = internalURL(router.getSnapshot().url, href);

    if (!target) return;
    event.preventDefault();
    void router.navigate(target.href, { replace });
  };

  return createElement("a", { ...props, href, onClick: click });
}

/** Form attributes with GET loader requests or POST, PUT, PATCH, and DELETE actions. */
export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method"> {
  action?: string;
  method?: "get" | "post" | "put" | "patch" | "delete";
}

type FormSubmitEvent = Parameters<NonNullable<FormProps["onSubmit"]>>[0];

type NativeSubmitEvent = FormSubmitEvent & { nativeEvent?: SubmitEvent };
interface InternalFormProps extends FormProps {
  fetcher?: Fetcher;
}

/** Submit form data to a registered route without a document reload. */
export function Form({
  action,
  method = "post",
  fetcher,
  onSubmit,
  ...props
}: InternalFormProps): ReactNode {
  const router = useRouter();
  const submit = (event: FormSubmitEvent) => {
    onSubmit?.(event);

    if (event.defaultPrevented) return;

    const submitter = (
      ((event as NativeSubmitEvent).nativeEvent ?? event) as SubmitEvent
    ).submitter as HTMLButtonElement | null;
    const target = internalURL(
      router.getSnapshot().url,
      submitter?.getAttribute("formaction") ??
        action ??
        router.getSnapshot().url,
    );

    if (!target) return;
    event.preventDefault();

    const data = new FormData(event.currentTarget, submitter);
    const verb = (
      submitter?.getAttribute("formmethod") ?? method
    ).toUpperCase();

    if (verb === "GET") {
      target.search = new URLSearchParams(
        Array.from(data, ([key, value]) => [
          key,
          typeof value === "string" ? value : value.name,
        ]),
      ).toString();

      void (fetcher ? fetcher.load : router.navigate)(target.href);

      return;
    }

    const options: SubmitOptions = {
      method: verb as SubmitOptions["method"],
    };

    void (fetcher ?? router).submit(target.href, data, options);
  };

  return createElement("form", {
    ...props,
    action,
    method: method === "get" ? "get" : "post",
    onSubmit: submit,
  });
}

/** Action method and optional explicit route URL for a fetcher submission. */
export interface FetcherSubmitOptions extends SubmitOptions {
  action?: string;
}

/** Typed independent request state, methods, and a bound Form component. */
export interface TypedFetcher<T> extends Omit<FetcherSnapshot, "data"> {
  data?: T;
  Form: ComponentType<FormProps>;
  load: (url?: string) => Promise<Result>;
  submit: (body: FormData, options?: FetcherSubmitOptions) => Promise<Result>;
}

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<T extends RouteModule>(
  route: RouteDefinition<T>,
): TypedFetcher<
  | DataOf<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
  | DataOf<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher<
  T extends AnyDataFunction = DataFunction,
>(): TypedFetcher<DataOf<T>>;

/** Create a fetcher for independent route reads and mutations; its data stays local. */
export function useFetcher(route?: RouteDefinition): TypedFetcher<unknown> {
  const router = useRouter();
  const fetcher = useMemo(() => router.createFetcher(), [router]);
  useEffect(() => () => fetcher.dispose(), [fetcher]);

  const state = useSyncExternalStore(
    fetcher.subscribe,
    fetcher.getSnapshot,
    fetcher.getSnapshot,
  );
  const BoundForm = useMemo(
    () =>
      function FetcherForm(props: FormProps) {
        return createElement(Form, {
          action: fetcherTarget(router, route),
          ...props,
          fetcher,
        });
      },
    [fetcher, route?.path, router],
  );

  return {
    ...state,
    Form: BoundForm,
    load: (url) => fetcher.load(url ?? fetcherTarget(router, route)),
    submit: (body, options) =>
      fetcher.submit(
        options?.action ?? fetcherTarget(router, route),
        body,
        options,
      ),
  };
}

function fetcherTarget(router: Router, route?: RouteDefinition): string {
  const snapshot = router.getSnapshot();

  return !route || route.path === snapshot.path ? snapshot.url : route.path;
}
