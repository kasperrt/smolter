import type { NavigateOptions, Router } from "@smolter/core";
import type { NavigationType } from "@smolter/core/navigation";
import { pendingLocation } from "@smolter/core/presentation";
import {
  type Submission,
  type SubmissionOptions,
  submitValue,
} from "@smolter/core/submission";
import { useCallback } from "preact/hooks";
import { useRouter, useSnapshot } from "./context.ts";
import type { NavigateFunction } from "./navigation.tsx";
import { useNavigationSnapshot } from "./navigation-state.ts";
import { OutletContext, useApplication } from "./root-context.ts";
import type { RouteData } from "./route-types.ts";
import { useContext, useMemo } from "./runtime.ts";

/** Read root loader data from the application context. */
export function useRootData<T = unknown>(): RouteData<T> {
  return useApplication().root as RouteData<T>;
}

/** Read root data or the active route's data by its manifest identifier. */
export function useRouteLoaderData<T = unknown>(
  id: string,
): RouteData<T> | undefined {
  const app = useApplication();
  const snapshot = useSnapshot();
  if (id === "root") return app.root as RouteData<T>;
  const route = app.routes.find((item) => item.id === id);
  if (!route || route.path !== snapshot.path) return undefined;
  return snapshot.data as RouteData<T>;
}

export { useSnapshot };

/** Read the current route error for an error boundary. */
export function useRouteError(): Error | undefined {
  return useSnapshot("error");
}

/** Read the current page navigation or submission state. */
export function useNavigation(): {
  state: "idle" | "loading" | "submitting";
  location: URL | undefined;
} {
  const router = useRouter<Router>();
  const snapshot = useSnapshot();
  const location = pendingLocation(router);
  return useMemo(
    () => ({
      state: snapshot.state,
      location,
    }),
    [snapshot.state, location?.href],
  );
}

/** Read the active flat route match and loader data; this is not a nested layout match chain. */
export function useMatches(): {
  id: string;
  data: unknown;
  params: import("@smolter/core").Params;
}[] {
  const router = useRouter();
  const snapshot = useSnapshot();
  const route = router.routes.find((item) => item.path === snapshot.path);
  return [
    { id: route?.id ?? "", data: snapshot.data, params: snapshot.params },
  ];
}

/** Read context supplied by the nearest Outlet. */
export function useOutletContext<T>(): T {
  return useContext(OutletContext) as T;
}

/** Return a function that submits form data through the current router. */
export function useSubmit(): (
  value: Submission,
  options?: SubmissionOptions,
) => Promise<void> | Promise<import("@smolter/core").Result<unknown>> {
  const router = useRouter<Router>();
  return useCallback(
    (value: Submission, options?: SubmissionOptions) =>
      submitValue(router, value, options),
    [router],
  );
}

/** Read the current router location as a URL. */
export function useURLLocation(): URL & { state: unknown; key: string } {
  const href = useSnapshot("url");
  const snapshot = useNavigationSnapshot(useRouter<Router>());
  return useMemo(
    () =>
      Object.assign(new URL(href), {
        state: snapshot.state,
        key: snapshot.key,
      }),
    [href, snapshot.state, snapshot.key],
  );
}

/** Return the application navigation function, including history offsets and relative destinations. */
export function useNavigate(): NavigateFunction {
  const router = useRouter<Router>();
  return useCallback(
    (to, options) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }
      const current = new URL(router.getSnapshot().url);
      const target =
        typeof to === "string"
          ? to
          : `${to.pathname ?? current.pathname}${to.search ?? current.search}${to.hash ?? current.hash}`;
      void router.navigate(target, options);
    },
    [router],
  );
}

/** Read URL search parameters and update them through router navigation. */
export function useSearchParams(): [
  URLSearchParams,
  (
    value: URLSearchParams | Record<string, string>,
    options?: NavigateOptions,
  ) => void,
] {
  const location = new URL(useSnapshot("url"));
  const navigate = useNavigate();
  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const set = useCallback(
    (
      value: URLSearchParams | Record<string, string>,
      options?: NavigateOptions,
    ) => {
      navigate(`${location.pathname}?${new URLSearchParams(value)}`, options);
    },
    [location.pathname, navigate],
  );
  return [params, set];
}

/** Read the last browser history operation. */
export function useNavigationType(): NavigationType {
  return useNavigationSnapshot(useRouter<Router>()).type;
}
