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
export function RouterApplication({
  root: initialRoot,
  document: documentMode,
  ...props
}: ApplicationProps): ReactNode {
  const store = useMemo(
    () => props.rootStore ?? createStore(initialRoot),
    [props.rootStore, initialRoot],
  );
  const root = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const getRoot = () => {
    const snapshot = props.router.getSnapshot();
    return (
      props.rootModule?.[
        snapshot.error &&
        (props.rootError ||
          !props.routes.find((item) => item.path === snapshot.path)
            ?.ErrorBoundary)
          ? "ErrorBoundary"
          : "default"
      ] ?? Outlet
    );
  };
  const Root = useSyncExternalStore(props.router.subscribe, getRoot, getRoot);
  const Layout = props.rootModule?.Layout;
  const children = createElement(Root);
  return createElement(
    RouterProvider,
    { router: props.router },
    createElement(
      Application.Provider,
      { value: { ...props, root } },
      documentMode && Layout ? createElement(Layout, { children }) : children,
    ),
  );
}
