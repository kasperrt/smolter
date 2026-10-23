import { safeWrapAsync } from "./errors.ts";
import type { NavigationRouter } from "./navigation-router.ts";
import { createStore } from "./store.ts";
import type { NavigateOptions, Route, Router, Snapshot } from "./types.ts";

interface ResolvableRoute extends Route {
  resolveComponent?: () => unknown;
}

type CommitView = (update: () => void) => void;

interface Presentation {
  read: () => Snapshot;
  update: () => void;
  hold?: () => boolean;
}
const pending = new WeakMap<NavigationRouter, Presentation>();

// Optional deployment recovery delays only presentation of its current error.
export function holdRouteError(router: NavigationRouter, hold: () => boolean) {
  const view = pending.get(router);
  if (!view) return () => {};
  view.hold = hold;
  return () => {
    if (pending.get(router) !== view || view.hold !== hold) return;
    view.hold = undefined;
    view.update();
  };
}

export function pendingLocation(router: Router) {
  const snapshot = pending.get(router)?.read() ?? router.getSnapshot();
  return snapshot?.state !== "idle" && snapshot?.url
    ? new URL(snapshot.url)
    : undefined;
}

// Keep the committed route's view and data together while navigation loads.
// The underlying router still owns cancellation, redirects and fetcher state.
export function retainRoute(router: Router, commitView: CommitView) {
  const read = router.getSnapshot;
  let viewTransition: boolean | undefined;
  const navigate = router.navigate;
  router.navigate = (href, options: NavigateOptions = {}) => {
    viewTransition = options.viewTransition;
    return navigate(href, options);
  };
  let visible = read();
  let revision = 0;
  const listeners = new Set<() => void>();
  const store = createStore(visible, listeners);
  const update = () => {
    const next = read();
    const current = ++revision;
    if (next.error && visible.loaded && view.hold?.()) return;
    if (next.state !== "idle" && visible.loaded) {
      visible = { ...visible, state: next.state };
      store.update(visible);
      return;
    }
    const commit = () => {
      if (current !== revision) return;
      commitView(() => {
        visible = next;
        store.update(visible);
      });
    };
    if (
      visible.loaded &&
      viewTransition !== false &&
      typeof document !== "undefined" &&
      typeof document.startViewTransition === "function" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      new URL(visible.url).pathname !== new URL(next.url).pathname
    ) {
      const component = (path: string | undefined) => {
        const route = router.routes.find((item) => item.path === path) as
          | ResolvableRoute
          | undefined;
        return route?.resolveComponent?.() ?? route?.default;
      };
      const previousComponent = component(visible.path);
      const sharedView =
        previousComponent && previousComponent === component(next.path);
      if (!sharedView) {
        const transition = document.startViewTransition(commit);
        void safeWrapAsync(() => transition.ready);
        return;
      }
    }
    commit();
  };
  const view: Presentation = { read, update };
  pending.set(router, view);
  const unsubscribe = router.subscribe(update);
  router.getSnapshot = store.getSnapshot;
  router.subscribe = store.subscribe;
  const dispose = router.dispose;
  router.dispose = () => {
    unsubscribe();
    pending.delete(router);
    listeners.clear();
    dispose();
  };
}
