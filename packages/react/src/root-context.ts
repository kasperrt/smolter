import type { Router } from "@smolter/core";
import type { AppRoute, RootModule } from "./route-types.ts";
import { createContext, useContext } from "./runtime.ts";

export interface ApplicationContext {
  router: Router;
  routes: AppRoute[];
  root: unknown;
  rootError?: boolean;
  entry?: string;
  streaming?: boolean;
  initialData?: string;
  rootModule?: RootModule;
}

export const Application = createContext<ApplicationContext | null>(null);

export function useApplication() {
  const app = useContext(Application);
  if (!app) throw new Error("Root data requires RouterApplication.");
  return app;
}
