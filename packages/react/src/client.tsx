/**
 * React document hydration, browser history and deployment recovery.
 *
 * @module
 */
/** @jsxImportSource react */

import {
  type DeploymentOptions,
  recoverDeployment,
  watchDeployment,
} from "@smolter/client";
import { connectHashHistory } from "@smolter/client/hash-history";
import { readHydration } from "@smolter/client/hydration";
import { attachRootData } from "@smolter/client/root-data";
import {
  createDataRouter,
  matchRoutes,
  type Router,
  safeWrapAsync,
} from "@smolter/core";
import { connectNavigation } from "@smolter/core/navigation";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { retainRoute } from "@smolter/core/presentation";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { RouterApplication } from "./router.ts";

export * from "@smolter/client";
export { configureApplication } from "@smolter/core/environment";

/** Browser hydration settings for hash history, deployment recovery and deferred-data timeout. */
export interface MountApplicationOptions {
  hash?: boolean;
  deployment?: DeploymentOptions | null;
  /** Total initial deferred-data budget in integer milliseconds; not an inactivity timeout. Defaults to 8,000. */
  deferredTimeout?: number;
}

/** Create the browser application router and hydrate the document, installing recovery before initial lazy loading. */
export async function mountApplication(
  routes: AppRoute[],
  rootModule?: RootModule,
  options: boolean | MountApplicationOptions = false,
): Promise<Router> {
  const {
    hash = false,
    deployment = null,
    deferredTimeout,
  } = typeof options === "boolean" ? { hash: options } : options;
  const initialURL = new URL(
    hash ? location.hash.slice(1) || "/" : location.href,
    location.origin,
  );
  const initialRoute = matchRoutes(routes, initialURL.pathname)?.route as
    | AppRoute
    | undefined;
  const { error: preloadError } = await safeWrapAsync(() =>
    initialRoute?.preload?.(),
  );
  if (preloadError) {
    await recoverDeployment(deployment, initialURL);
    throw preloadError.cause ?? preloadError;
  }
  routes = prepareRoutes(routes);
  const element = document.getElementById("smolter-data");
  const initial = element?.textContent
    ? readHydration(element.textContent, deferredTimeout)
    : undefined;
  const hydration: Hydration | undefined = initial?.hydration;
  if (hydration?.snapshot.error)
    hydration.snapshot.error = Object.assign(
      new Error(hydration.snapshot.error.message),
      hydration.snapshot.error,
    );
  const router = createDataRouter(routes, {
    browser: !hash,
    url: hash
      ? new URL(location.hash.slice(1) || "/", location.origin).href
      : location.href,
    ...(hydration && { hydrationData: hydration.snapshot }),
  });
  const dispose = router.dispose;
  router.dispose = () => {
    initial?.dispose();
    dispose();
  };
  watchDeployment(router, deployment);
  if (hash) connectHashHistory(router);
  retainRoute(router, flushSync);
  connectNavigation(router);
  const rootStore = attachRootData(router, hydration?.root, rootModule);
  const props = {
    routes,
    router,
    root: hydration?.root,
    rootModule,
    rootStore,
    rootError: hydration?.rootError,
    initialData: element?.textContent ?? undefined,
  };
  if (hydration) {
    const mounted = hydrateRoot(
      document,
      <RouterApplication {...props} document />,
    );
    const cleanup = router.dispose;
    router.dispose = () => {
      mounted.unmount();
      cleanup();
    };
    return router;
  }
  const target = document.getElementById("root");
  if (target) {
    const mounted = createRoot(target);
    mounted.render(<RouterApplication {...props} />);
    const cleanup = router.dispose;
    router.dispose = () => {
      mounted.unmount();
      cleanup();
    };
  }
  return router;
}
