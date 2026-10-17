import type { Router } from "@smolter/core";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { createContext, useContext } from "./runtime.ts";

export interface ApplicationContext {
  router: Router;
  routes: AppRoute[];
  root: unknown;
  rootError?: boolean;
  streaming?: boolean;
  deferredBoundary?: (
    children: import("preact").ComponentChildren,
    fallback: import("preact").ComponentChildren,
  ) => import("preact").ComponentChildren;
  initialData?: string;
  rootModule?: RootModule;
  hydration?: Hydration;
  entry?: string;
}

export const Application = createContext<ApplicationContext | null>(null);
export const OutletContext = createContext<unknown>(undefined);

export function useApplication() {
  const app = useContext(Application);

  return app!;
}
