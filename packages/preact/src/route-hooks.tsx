import type { NavigateOptions, Router, SubmitOptions } from "@smolter/core";
import type { NavigationType } from "@smolter/core/navigation";
import { pendingLocation } from "@smolter/core/presentation";
import {
  type Submission,
  type SubmissionOptions,
  submissionBody,
  submissionSearch,
} from "@smolter/core/submission";
import { useCallback } from "preact/hooks";
import { useRouter, useSnapshot } from "./context.ts";
import type { NavigateFunction } from "./navigation.tsx";
import { useNavigationSnapshot } from "./navigation-state.ts";
import { OutletContext, useApplication } from "./root-context.ts";
import type { RouteData } from "./route-types.ts";
import { useContext, useMemo } from "./runtime.ts";

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

export function useRouteError(): Error | undefined {
  return useSnapshot("error");
}

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

export function useMatches(): {
  id: string;
  data: unknown;
  params: import("@smolter/core").Params;
}[] {
  const { routes } = useApplication();
  const snapshot = useSnapshot();
  const route = routes.find((item) => item.path === snapshot.path);

  return [
    { id: route?.id ?? "", data: snapshot.data, params: snapshot.params },
  ];
}

export function useOutletContext<T>(): T {
  return useContext(OutletContext) as T;
}

export function useSubmit(): (
  value: Submission,
  options?: SubmissionOptions,
) => Promise<void> | Promise<import("@smolter/core").Result<unknown>> {
  const router = useRouter<Router>();

  return useCallback(
    (value: Submission, options: SubmissionOptions = {}) => {
      const body = submissionBody(value, options.encType);
      const method = options.method?.toUpperCase();
      const target = options.action ?? router.getSnapshot().url;

      if (method === "GET") {
        const url = new URL(target, router.getSnapshot().url);
        url.search = submissionSearch(body);

        return router.navigate(url.href, options);
      }

      return router.submit(target, body, {
        method: method as SubmitOptions["method"],
      });
    },
    [router],
  );
}

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

export function useSearchParams(): [
  URLSearchParams,
  (
    value: URLSearchParams | Record<string, string>,
    options?: NavigateOptions,
  ) => void,
] {
  const location = useURLLocation();
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

export function useNavigationType(): NavigationType {
  return useNavigationSnapshot(useRouter<Router>()).type;
}
