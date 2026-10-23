import { createRootStore } from "@smolter/client/root-data";
import { Fragment } from "preact";
import type { ReactNode } from "preact/compat";
import { useLayoutEffect, useRef } from "preact/hooks";
import { RouterProvider, useSnapshot } from "./context.ts";
import {
  Application,
  type ApplicationContext,
  OutletContext,
} from "./root-context.ts";
import { Routes } from "./routes.ts";
import {
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "./runtime.ts";

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
  const application = useContext(Application);
  const content =
    children ??
    createElement(Routes, {
      fallback: createElement("p", { role: "status" }, "Loading…"),
    });
  return createElement(
    OutletContext,
    { value: context ?? current },
    application ? createElement(StreamOutlet, { children: content }) : content,
  );
}

interface StreamOutletProps {
  children: ReactNode;
}

// Hydration claims only this outlet’s stream targets, retaining the comment
// structure Preact needs. Root boundaries remain outside its inert anchors.
function StreamOutlet({ children }: StreamOutletProps) {
  const { path, loaded, error } = useSnapshot();
  const application = useContext(Application)!;
  const route = application.routes.find((route) => route.path === path);
  const owner = error
    ? route?.ErrorBoundary
    : (route?.resolveComponent?.() ?? route?.default);
  const start = useRef<HTMLTemplateElement>(null);
  const end = useRef<HTMLTemplateElement>(null);
  const initial = useRef<{ owner: unknown; markers: Comment[] } | undefined>(
    undefined,
  );
  useLayoutEffect(() => {
    if (!loaded && !error) return;
    if (initial.current?.owner === owner) return;
    const markers: Comment[] = initial.current?.markers ?? [];
    const walker = document.createTreeWalker(start.current!.parentNode!, 129);
    walker.currentNode = start.current!;
    let node: Node | null;
    while ((node = walker.nextNode()) && node !== end.current) {
      if (node.nodeType === 8 && /^\/?\$s:/.test((node as Comment).data))
        markers.push(node as Comment);
    }
    if (initial.current) {
      for (const marker of markers) marker.remove();
      markers.length = 0;
    } else {
      for (const marker of markers) marker.data += ":smolter";
    }
    initial.current = { owner, markers };
  }, [owner, loaded, error]);
  return createElement(
    Fragment,
    null,
    createElement("template", { ref: start }),
    children,
    createElement("template", { ref: end }),
  );
}

/** Root data, document components and request-scoped router for an application. */
export interface ApplicationProps extends ApplicationContext {
  document?: boolean;
  rootStore?: ReturnType<typeof createRootStore>;
}

/** Render a Preact root document and active route with shared root data and application context. */
export function RouterApplication({
  root: initialRoot,
  document: documentMode,
  ...props
}: ApplicationProps): import("preact").JSX.Element {
  const rootStore = useMemo(
    () => props.rootStore ?? createRootStore(initialRoot),
    [props.rootStore, initialRoot],
  );
  const root = useSyncExternalStore(rootStore.subscribe, rootStore.getSnapshot);
  // Streamed Suspense fallbacks need these ancestor updates for Preact cleanup.
  const snapshot = useSyncExternalStore(
    props.router.subscribe,
    props.router.getSnapshot,
  );
  const Root =
    props.rootModule?.[
      snapshot.error &&
      (props.rootError ||
        !props.routes.find((item) => item.path === snapshot.path)
          ?.ErrorBoundary)
        ? "ErrorBoundary"
        : "default"
    ] ?? Outlet;
  const Layout = props.rootModule?.Layout;
  const children = createElement(Root, null);
  return createElement(
    RouterProvider,
    { router: props.router },
    createElement(
      Application,
      { value: { ...props, root } },
      documentMode && Layout ? createElement(Layout, { children }) : children,
    ),
  );
}

export { prepareRoutes } from "@smolter/core/prepare-routes";
