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
import { attachRootData } from "./root-data.ts";
import type { AppRoute, Hydration, RootModule } from "./route-types.ts";
import { prepareRoutes, RouterApplication } from "./router.tsx";

export * from "@smolter/client";
export { configureApplication } from "@smolter/core/environment";

export interface MountApplicationOptions {
  hash?: boolean;
  deployment?: DeploymentOptions | null;
}

export async function mountApplication(
  routes: AppRoute[],
  rootModule?: RootModule,
  options: boolean | MountApplicationOptions = false,
): Promise<Router> {
  const { hash = false, deployment = null } =
    typeof options === "boolean" ? { hash: options } : options;
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
  const hydration: Hydration | undefined = element?.textContent
    ? JSON.parse(element.textContent, (_key, value) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("__smolterRejected" in value)
        )
          return value;

        const error = Object.assign(
          new Error(value.__smolterRejected.message),
          value.__smolterRejected,
        );
        const rejected = Promise.reject(error);
        void rejected.catch(() => {});

        return rejected;
      })
    : undefined;

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
    hydrate(<RouterApplication {...props} document />, document);

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
