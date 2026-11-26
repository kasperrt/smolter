/**
 * Preact document hydration, browser history and deployment recovery.
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
  type Router,
  safeWrapAsync,
} from "@smolter/core";
import { errorData } from "@smolter/core/errors";
import { namespace } from "@smolter/core/namespace";
import { connectNavigation } from "@smolter/core/navigation";
import { retainRoute } from "@smolter/core/presentation";
import { hydrate, render } from "preact";
import { flushSync } from "preact/compat";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { prepareRoutes, RouterApplication } from "./router.tsx";
import { createElement } from "./runtime.ts";

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
  const initialURL = hash ? hashURL(location.hash) : new URL(location.href);
  const initialRoute = matchRoutes(routes, initialURL.pathname)?.route as
    | AppRoute
    | undefined;
  if (initialRoute?.preload) {
    const { error: preloadError } = await safeWrapAsync(
      () => initialRoute.preload!(),
      true,
    );
    if (preloadError) {
      await recoverDeployment(deployment, initialURL);
      throw preloadError.cause ?? preloadError;
    }
  }
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
  };
  if (hydration) {
    // Explicitly unmanaged head nodes must not participate in positional hydration.
    const preserved = Array.from(
      document.querySelectorAll(
        `head > [data-${namespace}-preserve], body > [data-${namespace}-stream]`,
      ),
      (node) => ({ node, next: node.nextSibling, parent: node.parentNode! }),
    );
    for (const { node } of preserved) node.remove();
    const { error } = await safeWrapAsync(
      () =>
        hydrate(
          createElement(RouterApplication, { ...props, document: true }),
          document,
        ),
      true,
    );
    for (const { node, next, parent } of preserved.reverse())
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    if (error) throw error.cause ?? error;
    return router;
  }
  const target = document.getElementById("root");
  if (target) render(createElement(RouterApplication, props), target);
  return router;
}
