/**
 * React document hydration, browser history and deployment recovery.
 *
 * @module
 */

import {
  type DeploymentOptions,
  recoverDeployment,
  watchDeployment,
} from "@smolter/client";
import { connectHashHistory, hashURL } from "@smolter/client/hash-history";
import { hydrationPayload, readHydration } from "@smolter/client/hydration";
import { attachRootData } from "@smolter/client/root-data";
import {
  createDataRouter,
  matchRoutes,
  type RouteDiscovery,
  type Router,
  safeWrapAsync,
} from "@smolter/core";
import { errorData } from "@smolter/core/errors";
import { connectNavigation } from "@smolter/core/navigation";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { retainRoute } from "@smolter/core/presentation";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { RouterApplication } from "./router.ts";
import { createElement } from "./runtime.ts";

export * from "@smolter/client";
export { configureApplication } from "@smolter/core/environment";

/** Browser hydration settings for hash history, deployment recovery and deferred-data timeout. */
export interface MountApplicationOptions {
  hash?: boolean;
  deployment?: DeploymentOptions | null;
  /** Total initial deferred-data budget in integer milliseconds; not an inactivity timeout. Defaults to 8,000. */
  deferredTimeout?: number;
  /** Route discovery from virtual:smolter/routes; protected deep links are discovered before hydration. */
  discover?: RouteDiscovery;
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
    discover,
  } = typeof options === "boolean" ? { hash: options } : options;
  const initialURL = hash ? hashURL(location.hash) : new URL(location.href);
  routes = prepareRoutes(routes);
  const payload = hydrationPayload();
  const initial = payload ? readHydration(payload, deferredTimeout) : undefined;
  const hydration: Hydration | undefined = initial?.hydration;
  if (hydration?.snapshot.error)
    hydration.snapshot.error = Object.assign(
      new Error(hydration.snapshot.error.message),
      errorData(hydration.snapshot.error),
    );
  const router = createDataRouter(routes, {
    browser: !hash,
    url: initialURL.href,
    ...(hydration && { hydrationData: hydration.snapshot }),
    ...(discover && {
      discover: {
        attach: (table, host, cache) =>
          discover.attach(table, host, cache, (found) =>
            prepareRoutes([...found]),
          ),
      },
    }),
  });
  const dispose = router.dispose;
  router.dispose = () => {
    initial?.dispose();
    dispose();
  };
  // A protected deep link joins the route table before its module preloads.
  await router.discover?.(initialURL.href);
  const initialRoute = matchRoutes(router.routes, initialURL.pathname)?.route as
    | AppRoute
    | undefined;
  if (initialRoute?.preload) {
    const { error: preloadError } = await safeWrapAsync(
      () => initialRoute.preload!(),
      true,
    );
    if (preloadError) {
      router.dispose();
      await recoverDeployment(deployment, initialURL);
      throw preloadError.cause ?? preloadError;
    }
  }
  watchDeployment(router, deployment);
  if (hash) connectHashHistory(router);
  retainRoute(router, flushSync);
  connectNavigation(router);
  const rootStore = attachRootData(router, hydration?.root, rootModule);
  const props = {
    // The router's table also receives routes discovered after mounting.
    routes: router.routes as AppRoute[],
    router,
    root: hydration?.root,
    rootModule,
    rootStore,
    rootError: hydration?.rootError,
    initialData: payload,
  };
  const target = document.getElementById("root");
  const mounted = hydration
    ? hydrateRoot(
        document,
        createElement(RouterApplication, { ...props, document: true }),
      )
    : target && createRoot(target);
  if (mounted) {
    if (!hydration) mounted.render(createElement(RouterApplication, props));
    const cleanup = router.dispose;
    router.dispose = () => {
      mounted.unmount();
      cleanup();
    };
  }
  return router;
}
