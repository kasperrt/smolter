/**
 * React components and typed data hooks. Import from smolter/react.
 * @module
 */

import type { Router, Snapshot } from "@smolter/core";
import type { ReactNode } from "./runtime.ts";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "./runtime.ts";

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
  useEffect(router.start, [router]);

  return createElement(RouterContext.Provider, { value: router }, children);
}
/** Hooks require a RouterProvider. */
export function useRouter(): Router {
  return useContext(RouterContext) as Router;
}

type SnapshotSelector<T> = (snapshot: Snapshot) => T;

export function useSnapshot<T>(select: SnapshotSelector<T>): T {
  const router = useRouter();

  const getSnapshot = () => select(router.getSnapshot());

  return useSyncExternalStore(router.subscribe, getSnapshot, getSnapshot);
}
