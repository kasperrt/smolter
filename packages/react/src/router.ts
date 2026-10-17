import { createStore } from "@smolter/core/store";
import { RouterProvider } from "./context.ts";
import { Outlet } from "./outlet.ts";
import { Application, type ApplicationContext } from "./root-context.ts";
import {
  createElement,
  type ReactNode,
  useMemo,
  useSyncExternalStore,
} from "./runtime.ts";

/** Root data, document components and request-scoped router for an application. */
export interface ApplicationProps extends ApplicationContext {
  document?: boolean;
  rootStore?: ReturnType<typeof createStore>;
}

/** Compose a persistent root layout with route views and observable root loader data. */
export function RouterApplication(props: ApplicationProps): ReactNode {
  const store = useMemo(
    () => props.rootStore ?? createStore(props.root),
    [props.rootStore, props.root],
  );
  const root = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const snapshot = useSyncExternalStore(
    props.router.subscribe,
    props.router.getSnapshot,
    props.router.getSnapshot,
  );
  const route = props.routes.find((item) => item.path === snapshot.path);
  const Root =
    snapshot.error && (props.rootError || !route?.ErrorBoundary)
      ? (props.rootModule?.ErrorBoundary ?? Outlet)
      : (props.rootModule?.default ?? Outlet);
  const Layout = props.rootModule?.Layout;
  const children = createElement(Root);
  return createElement(
    RouterProvider,
    { router: props.router },
    createElement(
      Application.Provider,
      { value: { ...props, root } },
      props.document && Layout ? createElement(Layout, { children }) : children,
    ),
  );
}
