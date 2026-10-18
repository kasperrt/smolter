/**
 * Preact components and typed data hooks. Import from @kasperrt/smolter/preact.
 * @module
 */

import type { NavigationRouter, Snapshot } from "@smolter/core";

import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "./runtime.ts";

const RouterContext = createContext<NavigationRouter | undefined>(undefined);

/** Router instance and children rendered within its context. */
export interface RouterProviderProps {
  router: NavigationRouter;
  children?: ReactNode;
}

/** Provide a router to descendant hooks and connect its browser lifecycle. */
export function RouterProvider({
  router,
  children,
}: RouterProviderProps): ReactNode {
  useEffect(router.start, [router]);
  return createElement(RouterContext, { value: router }, children);
}
/** Hooks require a RouterProvider. */
export function useRouter<T extends NavigationRouter = NavigationRouter>(): T {
  return useContext(RouterContext) as T;
}

export function useSnapshot(): Snapshot;

export function useSnapshot<K extends keyof Snapshot>(key: K): Snapshot[K];

export function useSnapshot<K extends keyof Snapshot>(
  key: K,
  path: string | undefined,
): Snapshot[K] | undefined;

export function useSnapshot(key?: keyof Snapshot, path?: string) {
  const router = useRouter();
  const getSnapshot = () => {
    const snapshot = router.getSnapshot();
    if (path !== undefined && path !== snapshot.path) return undefined;
    return key ? snapshot[key] : snapshot;
  };
  return useSyncExternalStore(router.subscribe, getSnapshot);
}
