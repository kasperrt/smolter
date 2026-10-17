/** @jsxImportSource preact */

import type { DataFunction } from "@smolter/core";
import { normalizeResult } from "@smolter/core/responses";
import type { ReactNode } from "preact/compat";
import { RouterProvider } from "./context.ts";
import {
  Application,
  type ApplicationContext,
  OutletContext,
} from "./root-context.ts";
import { createRootStore } from "./root-data.ts";
import type { AppRoute } from "./route-types.ts";
import { Routes } from "./routes.ts";
import { useContext, useMemo, useSyncExternalStore } from "./runtime.ts";

/** Optional children and context shared with descendants through useOutletContext. */
export interface OutletProps {
  context?: unknown;
  children?: ReactNode;
}

/** Render supplied children or the active route, and provide outlet context to descendants. */
export function Outlet({
  context,
  children,
}: OutletProps): import("preact").JSX.Element {
  const current = useContext(OutletContext);

  return (
    <OutletContext value={context ?? current}>
      {children ?? <Routes fallback={<p role="status">Loading…</p>} />}
    </OutletContext>
  );
}

export interface ApplicationProps extends ApplicationContext {
  document?: boolean;
  rootStore?: ReturnType<typeof createRootStore>;
}

/** Render a Preact root document and active route with shared root data and application context. */
export function RouterApplication(
  props: ApplicationProps,
): import("preact").JSX.Element {
  const rootStore = useMemo(
    () => props.rootStore ?? createRootStore(props.root),
    [props.rootStore, props.root],
  );
  const root = useSyncExternalStore(rootStore.subscribe, rootStore.getSnapshot);
  const snapshot = useSyncExternalStore(
    props.router.subscribe,
    props.router.getSnapshot,
  );
  const route = props.routes.find((item) => item.path === snapshot.path);
  const Root =
    snapshot.error && (props.rootError || !route?.ErrorBoundary)
      ? (props.rootModule?.ErrorBoundary ?? Outlet)
      : (props.rootModule?.default ?? Outlet);
  const Layout = props.rootModule?.Layout;
  const children = <Root />;

  return (
    <RouterProvider router={props.router}>
      <Application value={{ ...props, root }}>
        {props.document ? Layout && <Layout>{children}</Layout> : children}
      </Application>
    </RouterProvider>
  );
}

export function prepareRoutes(
  routes: AppRoute[],
  preserveDeferred = false,
): AppRoute[] {
  return routes.map((route) => {
    const wrapped: AppRoute = {
      ...route,
      path: route.routePath ?? route.path,
      shouldRevalidate: (args) => {
        const { currentUrl, nextUrl } = args;

        if (
          args.reason === "navigation" &&
          currentUrl.pathname === nextUrl.pathname &&
          currentUrl.search === nextUrl.search &&
          currentUrl.hash !== nextUrl.hash
        )
          return false;

        return route.shouldRevalidate?.(args) ?? args.defaultShouldRevalidate;
      },
    };

    for (const key of [
      "loader",
      "action",
      "clientLoader",
      "clientAction",
    ] as const) {
      const handler = route[key] as DataFunction | undefined;

      if (!handler) continue;

      wrapped[key] = (args) =>
        Promise.resolve()
          .then(() => handler(args))
          .then(
            (value) => normalizeResult(value, !preserveDeferred),
            (error) => normalizeResult(error, !preserveDeferred),
          );
    }

    return wrapped;
  });
}
