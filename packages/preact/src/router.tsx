/** @jsxImportSource preact */

import { createRootStore } from "@smolter/client/root-data";
import type { ReactNode } from "preact/compat";
import { useLayoutEffect, useRef } from "preact/hooks";
import { RouterProvider, useSnapshot } from "./context.ts";
import {
  Application,
  type ApplicationContext,
  OutletContext,
} from "./root-context.ts";
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
  const application = useContext(Application);
  const content = children ?? (
    <Routes fallback={<p role="status">Loading…</p>} />
  );
  return (
    <OutletContext value={context ?? current}>
      {application ? <StreamOutlet>{content}</StreamOutlet> : content}
    </OutletContext>
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
    const walker = document.createNodeIterator(start.current!.parentNode!, 128);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (
        start.current!.compareDocumentPosition(node) & 4 &&
        end.current!.compareDocumentPosition(node) & 2 &&
        /^\/?\$s:/.test((node as Comment).data)
      )
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
  return (
    <>
      <template ref={start} />
      {children}
      <template ref={end} />
    </>
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
        {documentMode && Layout ? <Layout>{children}</Layout> : children}
      </Application>
    </RouterProvider>
  );
}

export { prepareRoutes } from "@smolter/core/prepare-routes";
