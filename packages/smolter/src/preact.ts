import type {
  AnchorHTMLAttributes,
  ComponentType,
  FormHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "preact/compat";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "preact/compat";
import type {
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
import { matchRoutes } from "./core.ts";

export type * from "./core.ts";
export { createRouter, defineRoute } from "./core.ts";

const RouterContext = createContext<Router | undefined>(undefined);
export interface RouterProviderProps {
  router: Router;
  children?: ReactNode;
}
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
export type LoaderSource = RouteModule | DataFunction;
export type LoaderData<T> = T extends DataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<T["loader"]>
    : unknown;
export type ActionData<T> = T extends DataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<T["action"]>
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
export function useActionData<T extends LoaderSource = RouteModule>(
  route?: T,
): ActionData<T> | undefined {
  return useData("actionData", route) as ActionData<T> | undefined;
}
export function useParams(): Snapshot["params"] {
  return useSnapshot().params;
}
export function useLocation(): readonly [string, Router["navigate"]] {
  const router = useRouter();
  const snapshot = useSnapshot();
  return [snapshot.url.replace(/^\w+:\/\/[^/]+/, ""), router.navigate];
}
export function useRevalidator(): Router["revalidate"] {
  return useRouter().revalidate;
}
export interface ViewModule extends RouteModule {
  default?: ComponentType;
  HydrateFallback?: ComponentType;
  ErrorBoundary?: ComponentType<ErrorProps>;
}
export interface ErrorProps {
  error: Error;
}
export interface RoutesProps {
  fallback?: ReactNode;
}
/** Renders the first matching registered module. */
export function Routes({ fallback = null }: RoutesProps): ReactNode {
  const router = useRouter();
  const state = useSnapshot();
  const module = matchRoutes(router.routes, new URL(state.url).pathname)
    ?.route as RouteDefinition<ViewModule> | undefined;
  if (state.error) {
    if (module?.ErrorBoundary)
      return createElement(module.ErrorBoundary, { error: state.error });
    return state.error.message;
  }
  if (state.state === "loading" && state.data === undefined) {
    if (module?.HydrateFallback)
      return createElement(module.HydrateFallback, {});
    return fallback;
  }
  if (module?.default) return createElement(module.default, {});
  return fallback;
}
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}
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
    const target = new URL(href, router.getSnapshot().url);
    if (target.origin !== new URL(router.getSnapshot().url).origin) return;
    event.preventDefault();
    void router.navigate(target.href, { replace });
  };
  return createElement("a", { ...props, href, onClick: click });
}
export interface FormProps
  extends Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "method"> {
  action?: string;
  method?: "get" | "post" | "put" | "patch" | "delete";
}
type FormSubmitEvent = Parameters<NonNullable<FormProps["onSubmit"]>>[0];
interface InternalFormProps extends FormProps {
  fetcher?: Fetcher;
}
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
      ("nativeEvent" in event ? event.nativeEvent : event) as SubmitEvent
    ).submitter as HTMLButtonElement | null;
    const target = new URL(
      submitter?.getAttribute("formaction") ??
        action ??
        router.getSnapshot().url,
      router.getSnapshot().url,
    );
    if (target.origin !== new URL(router.getSnapshot().url).origin) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget, submitter);
    const verb = submitter?.getAttribute("formmethod") ?? method;
    if (verb.toLowerCase() === "get") {
      target.search = new URLSearchParams(
        Array.from(data, ([key, value]) => [
          key,
          typeof value === "string" ? value : value.name,
        ]),
      ).toString();
      if (fetcher) {
        void fetcher.load(target.href);
        return;
      }
      void router.navigate(target.href);
      return;
    }
    const options: SubmitOptions = {
      method: verb.toUpperCase() as SubmitOptions["method"],
    };
    if (fetcher) {
      void fetcher.submit(target.href, data, options);
      return;
    }
    void router.submit(target.href, data, options);
  };
  return createElement("form", {
    ...props,
    action,
    method: method === "get" ? "get" : "post",
    onSubmit: submit,
  });
}
export interface FetcherSubmitOptions extends SubmitOptions {
  action?: string;
}
export interface TypedFetcher<T> extends Omit<FetcherSnapshot, "data"> {
  data?: T;
  Form: ComponentType<FormProps>;
  load: (url?: string) => Promise<Result>;
  submit: (body: FormData, options?: FetcherSubmitOptions) => Promise<Result>;
}
export function useFetcher<T extends RouteModule>(
  route: RouteDefinition<T>,
): TypedFetcher<DataOf<T["action"]> | DataOf<T["loader"]>>;
export function useFetcher<
  T extends DataFunction = DataFunction,
>(): TypedFetcher<DataOf<T>>;
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
