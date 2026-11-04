import { applicationEnvironment } from "./environment.ts";
import type { NavigationRouter } from "./navigation-router.ts";
import { createStore } from "./store.ts";
import type { Router, Snapshot } from "./types.ts";

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
      revision++;
      commitView(() => {
        visible = next;
        store.update(visible);
      });
    };
    const handler = applicationEnvironment?.commitRoute;
    if (handler) {
      handler(commit, visible, next);
      return;
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
    revision++;
    unsubscribe();
    pending.delete(router);
    listeners.clear();
    dispose();
  };
}
