import {
  handoffDocument,
  leaveDocument,
  resolveApplicationURL,
} from "./environment.ts";
import { createStore } from "./store.ts";
import type { NavigateOptions, Router } from "./types.ts";
import { navigationClick } from "./url.ts";

export type NavigationType = "POP" | "PUSH" | "REPLACE";

export interface NavigationSnapshot {
  type: NavigationType;
  state: unknown;
  key: string;
  preventScrollReset: boolean;
}

const scrollHistory = new WeakMap<Router, Map<string, [number, number]>>();

export function scrollPositions(router: Router) {
  let positions = scrollHistory.get(router);

  if (!positions) {
    positions = new Map();
    scrollHistory.set(router, positions);
  }

  return positions;
}

const stores = new WeakMap<Router, ReturnType<typeof createNavigationStore>>();

function createNavigationStore() {
  return createStore<NavigationSnapshot>({
    type: "POP",
    state: typeof history === "undefined" ? null : history.state?.state,
    key:
      typeof history === "undefined"
        ? "initial"
        : (history.state?.key ?? "initial"),
    preventScrollReset: false,
  });
}

export function navigationStore(router: Router) {
  let store = stores.get(router);

  if (!store) {
    store = createNavigationStore();
    stores.set(router, store);
  }

  return store;
}

export function connectNavigation(router: Router) {
  const store = navigationStore(router);
  const navigate = router.navigate;
  let sequence = 0;
  let pending: NavigationSnapshot | undefined;
  const committed = () => {
    if (!pending || router.getSnapshot().state !== "idle") return;

    const next = pending;
    pending = undefined;

    if (next.type !== "POP") history.replaceState(next, "", location.href);

    store.update(next);
  };
  const unsubscribe = router.subscribe(committed);

  const rememberScroll = () => {
    scrollPositions(router).set(store.getSnapshot().key, [
      window.scrollX,
      window.scrollY,
    ]);
  };

  router.navigate = async (href, options: NavigateOptions = {}) => {
    const destination = resolveApplicationURL(
      new URL(href, router.getSnapshot().url),
    );

    if (destination.origin !== location.origin) {
      leaveDocument(destination);

      return;
    }

    rememberScroll();
    const current = ++sequence;
    pending = {
      type: options.replace ? "REPLACE" : "PUSH",
      state: options.state ?? null,
      key: `${Date.now().toString(36)}-${current}`,
      preventScrollReset: options.preventScrollReset ?? false,
    };
    // Retained views may commit after navigate resolves; the subscription waits
    // for that final idle snapshot rather than starting another listener.
    await navigate(href, options);
    committed();
  };

  const pop = () => {
    rememberScroll();
    pending = {
      ...history.state,
      type: "POP",
      key: history.state?.key ?? "initial",
      preventScrollReset: false,
    };
    committed();
  };

  const handoff = (event: MouseEvent) => {
    const anchor =
      event.target instanceof Element ? event.target.closest("a[href]") : null;

    if (
      !(anchor instanceof HTMLAnchorElement) ||
      !navigationClick(event, anchor)
    )
      return;

    const target = resolveApplicationURL(new URL(anchor.href));

    handoffDocument(event, target);
  };

  if (typeof document !== "undefined")
    document.addEventListener("click", handoff);

  window.addEventListener("popstate", pop);
  const dispose = router.dispose;
  router.dispose = () => {
    pending = undefined;
    unsubscribe();
    window.removeEventListener("popstate", pop);

    if (typeof document !== "undefined")
      document.removeEventListener("click", handoff);

    dispose();
  };
}
