/** Browser mounting and hydration for Preact applications. @module */
/** @jsxImportSource preact */

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

export async function mountApplication(
  routes: AppRoute[],
  rootModule?: RootModule,
  hash = false,
): Promise<Router> {
  const initialURL = new URL(
    hash ? location.hash.slice(1) || "/" : location.href,
    location.origin,
  );

  const initialRoute = matchRoutes(routes, initialURL.pathname)?.route as
    | AppRoute
    | undefined;

  await initialRoute?.preload?.();

  routes = prepareRoutes(routes);
  const element = document.getElementById("smolter-data");
  const hydration: Hydration | undefined = element?.textContent
    ? JSON.parse(element.textContent)
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
  retainRoute(router, flushSync);

  if (hash) connectHashHistory(router);

  connectNavigation(router);
  const rootStore = attachRootData(router, hydration?.root, rootModule);
  const props = {
    routes,
    router,
    root: hydration?.root,
    rootModule,
    rootStore,
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
  const navigate = router.navigate;
  router.navigate = async (url, options) => {
    const target = new URL(url, router.getSnapshot().url);
    const hash = `#${target.pathname}${target.search}`;
    history[options?.replace ? "replaceState" : "pushState"](null, "", hash);
    await navigate(url, options);
  };
  const onHashChange = () => void navigate(location.hash.slice(1) || "/");
  window.addEventListener("hashchange", onHashChange);
  const dispose = router.dispose;
  router.dispose = () => {
    window.removeEventListener("hashchange", onHashChange);
    dispose();
  };
}
