import type { NavigationRouter } from "./navigation-router.ts";
import type { CommitOptions, Route, RouteModule } from "./types.ts";

interface PresentedRoute extends Route {
  branch?: readonly Route[];
}

/** @smolter/view-transition */
export function routeTransition(
  routes: readonly Route[],
  path: string | undefined,
) {
  const route = routes.find((item) => item.path === path) as
    | PresentedRoute
    | undefined;
  let handler = route?.viewTransition;
  for (const node of route?.branch ?? [])
    if (node.viewTransition) handler = node.viewTransition;
  return handler;
}

export function lazyTransition(
  read: () => RouteModule | undefined,
): NonNullable<RouteModule["viewTransition"]> {
  return (commit, previous, next) => {
    const handler = read()?.viewTransition;
    if (handler) handler(commit, previous, next);
    else commit();
  };
}

// The leaving route presents departures; commit performs the document navigation once.
export function leaveTransition(
  router: NavigationRouter,
  destination: URL,
  leave: () => void,
): boolean {
  const previous = router.getSnapshot();
  const handler = routeTransition(router.routes, previous.path);
  if (!handler) return false;
  let left = false;
  const commit = (options?: CommitOptions) => {
    if (left) return;
    left = true;
    crossDocumentTransition(options?.crossDocument);
    // Let the opt-in reach style resolution after a same-document transition.
    if (options?.crossDocument) {
      requestAnimationFrame(leave);
      return;
    }
    leave();
  };
  handler(commit, previous, {
    url: destination.href,
    params: {},
    state: "loading",
    leaving: true,
  });
  return true;
}

// A departure owns its cross-document transition: keep it only when commit asks.
function crossDocumentTransition(types?: readonly string[]) {
  const optIn =
    types && document.head.appendChild(document.createElement("style"));
  if (optIn) optIn.textContent = "@view-transition{navigation:auto}";
  addEventListener(
    "pageswap",
    ({ viewTransition }) => {
      optIn?.remove();
      if (!types) viewTransition?.skipTransition();
      for (const type of types ?? []) viewTransition?.types.add(type);
    },
    { once: true },
  );
}
