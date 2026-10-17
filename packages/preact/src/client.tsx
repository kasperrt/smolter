/** Browser mounting and hydration for Preact applications. @module */
/** @jsxImportSource preact */

import {
  type DeploymentOptions,
  recoverDeployment,
  watchDeployment,
} from "@smolter/client";
import { createDataRouter, matchRoutes, type Router } from "@smolter/core";
import { connectNavigation } from "@smolter/core/navigation";
import { retainRoute } from "@smolter/core/presentation";
import { hydrate, render } from "preact";
import { flushSync } from "preact/compat";
import { readHydration } from "./deferred-hydration.ts";
import { attachRootData } from "./root-data.ts";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { prepareRoutes, RouterApplication } from "./router.tsx";

export * from "@smolter/client";
export { configureApplication } from "@smolter/core/environment";

export interface MountApplicationOptions {
  hash?: boolean;
  deployment?: DeploymentOptions | null;
  /** Maximum wait for initial deferred data, in milliseconds. Defaults to 30,000. */
  deferredTimeout?: number;
}

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

  await initialRoute?.preload?.().catch(async (error: unknown) => {
    await recoverDeployment(deployment, initialURL);
    throw error;
  });

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
  };

  if (hydration) {
    // Explicitly unmanaged head nodes must not participate in positional hydration.
    const preserved = Array.from(
      document.querySelectorAll(
        "head > [data-smolter-preserve], body > [data-smolter-stream]",
      ),
      (node) => ({ node, next: node.nextSibling, parent: node.parentNode! }),
    );
    for (const { node } of preserved) node.remove();

    await Promise.resolve()
      .then(() => hydrate(<RouterApplication {...props} document />, document))
      .finally(() => {
        for (const { node, next, parent } of preserved.reverse())
          parent.insertBefore(node, next?.parentNode === parent ? next : null);
      });

    return router;
  }

  const target = document.getElementById("root");

  if (target) render(<RouterApplication {...props} />, target);

  return router;
}

function connectHashHistory(router: Router) {
  const read = router.getSnapshot;
  const navigate = router.navigate;
  router.navigate = async (url, options) => {
    const target = new URL(url, router.getSnapshot().url);
    const hash = `#${target.pathname}${target.search}${target.hash}`;
    history[options?.replace ? "replaceState" : "pushState"](null, "", hash);
    await navigate(url, options);
  };
  const unsubscribe = router.subscribe(() => {
    const target = new URL(read().url);
    const hash = `#${target.pathname}${target.search}${target.hash}`;

    // Redirects commit inside the router rather than through navigate().
    if (location.hash !== hash) history.replaceState(history.state, "", hash);
  });
  const onHashChange = () => void navigate(location.hash.slice(1) || "/");
  window.addEventListener("hashchange", onHashChange);
  const dispose = router.dispose;
  router.dispose = () => {
    unsubscribe();
    window.removeEventListener("hashchange", onHashChange);
    dispose();
  };
}
