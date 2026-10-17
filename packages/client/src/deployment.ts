import type { NavigationRouter, Router } from "@smolter/core";
import { deploymentCheck } from "./deployment-check.ts";

interface WatcherState {
  sequence: number;
  mutations: number;
  cleanup?: () => void;
}

const watchers = new WeakMap<NavigationRouter, WatcherState>();

/** Build identity and the fresh, non-cacheable manifest URL emitted by deploymentPlugin. */
export interface DeploymentOptions {
  version: string;
  manifestURL: string;
  /** Maximum time to wait for the update check before continuing navigation. */
  timeout?: number;
  /** Override document navigation, for example to ask about unsaved changes. */
  reload?: (destination: URL) => void;
}

/** Check for deployment changes before navigation. Install before creating fetchers. Returns a cleanup function. */
export function watchDeployment(
  router: NavigationRouter,
  options: DeploymentOptions | null,
): () => void {
  if (!options || typeof window === "undefined") return () => {};

  const state = watchers.get(router) ?? { sequence: 0, mutations: 0 };
  state.cleanup?.();
  watchers.set(router, state);
  const check = deploymentCheck(options);
  const { changed, reload } = check;
  const read = router.getSnapshot;
  const navigate = router.navigate;
  const dispose = router.dispose;
  let stopped = false;
  let replay = false;
  const dataRouter = router as NavigationRouter &
    Partial<Pick<Router, "createFetcher" | "submit">>;
  const createFetcher = dataRouter.createFetcher;
  const submit = dataRouter.submit;
  const trackSubmission =
    (submit: Router["submit"]): Router["submit"] =>
    (...args) => {
      state.sequence++;
      state.mutations++;

      return submit(...args).finally(() => {
        state.mutations--;
      });
    };
  const guardedSubmit = submit && trackSubmission(submit);
  const guardedFetcher =
    createFetcher &&
    (() => {
      const fetcher = createFetcher();
      fetcher.submit = trackSubmission(fetcher.submit);

      return fetcher;
    });

  if (guardedSubmit) dataRouter.submit = guardedSubmit;
  if (guardedFetcher) dataRouter.createFetcher = guardedFetcher;
  const valid = (current: number) => current === state.sequence && !stopped;
  const canReload = (current: number) =>
    valid(current) && state.mutations === 0;

  const guarded: NavigationRouter["navigate"] = async (href, operation) => {
    const target = new URL(href, router.getSnapshot().url);
    const currentURL = new URL(router.getSnapshot().url);
    const current = ++state.sequence;

    if (
      target.origin === location.origin &&
      (target.pathname !== currentURL.pathname ||
        target.search !== currentURL.search) &&
      (await changed())
    ) {
      if (!valid(current) || (await reload(target, () => canReload(current))))
        return;
    }

    if (current === state.sequence && !stopped) await navigate(href, operation);
  };

  const pop = (event: PopStateEvent) => {
    if (replay) return;

    const target = new URL(location.href);
    const previous = new URL(read().url);
    const current = ++state.sequence;

    if (
      target.pathname === previous.pathname &&
      target.search === previous.search
    )
      return;

    event.stopImmediatePropagation();
    void changed().then(async (updated) => {
      if (!valid(current)) return;
      if (updated && (await reload(target, () => canReload(current)))) return;
      if (!valid(current)) return;

      replay = true;
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: event.state }),
      );
      replay = false;
    });
  };

  const preloadError = () => {
    // Intent prefetch is speculative: it must not reload the current page or
    // consume the recovery marker before a click records its destination.
    if (read().state !== "loading") return;

    const current = state.sequence;
    const target = new URL(read().url);
    void changed().then((updated) => {
      if (updated)
        return reload(
          target,
          () =>
            canReload(current) &&
            read().state !== "submitting" &&
            read().url === target.href,
        );
    });
  };

  function cleanup() {
    if (stopped) return;
    if (state.cleanup === cleanup) state.cleanup = undefined;
    stopped = true;
    state.sequence++;
    check.dispose();
    window.removeEventListener("popstate", pop, true);
    window.removeEventListener("vite:preloadError", preloadError);

    if (guardedSubmit && dataRouter.submit === guardedSubmit)
      dataRouter.submit = submit;
    if (guardedFetcher && dataRouter.createFetcher === guardedFetcher)
      dataRouter.createFetcher = createFetcher;
    if (router.navigate === guarded) router.navigate = navigate;
    if (router.dispose === guardedDispose) router.dispose = dispose;
  }

  function guardedDispose() {
    cleanup();
    dispose();
  }

  state.cleanup = cleanup;
  router.navigate = guarded;
  router.dispose = guardedDispose;
  window.addEventListener("popstate", pop, true);
  window.addEventListener("vite:preloadError", preloadError);

  return cleanup;
}

/** Recover an initial lazy-import failure before a router has mounted. Returns whether a reload was requested. */
export async function recoverDeployment(
  options: DeploymentOptions | null,
  destination?: URL,
): Promise<boolean> {
  if (!options || typeof window === "undefined") return false;

  const check = deploymentCheck(options);

  return check
    .changed()
    .then((changed) =>
      changed ? check.reload(destination ?? new URL(location.href)) : false,
    )
    .finally(check.dispose);
}
