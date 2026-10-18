import {
  type NavigationRouter,
  type Router,
  safeWrapAsync,
} from "@smolter/core";
import { holdRouteError } from "@smolter/core/presentation";
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
  /** Generated shared application fingerprint; omitted for legacy manifests. */
  shared?: string;
  /** Generated route dependency fingerprints, in route matching order. */
  routes?: { path: string; fingerprint: string }[];
  /** Minimum interval between completed routine manifest checks (default 30 seconds). Chunk failures bypass it. */
  checkInterval?: number;
  manifestURL: string;
  /** Maximum duration of a manifest request; ordinary navigation does not wait for it. */
  timeout?: number;
  /** Override document navigation, for example to ask about unsaved changes. */
  reload?: (destination: URL) => void;
}
/** Check for deployment changes alongside navigation. Install before creating fetchers. Returns a cleanup function. */
export function watchDeployment(
  router: NavigationRouter,
  options: DeploymentOptions | null,
): () => void {
  if (!options || typeof window === "undefined") return () => {};
  const state = watchers.get(router) ?? { sequence: 0, mutations: 0 };
  state.cleanup?.();
  watchers.set(router, state);
  const customReload = options.reload;
  const check = deploymentCheck(options);
  const { changed, known, reload } = check;
  const read = router.getSnapshot;
  const navigate = router.navigate;
  const dispose = router.dispose;
  let stopped = false;
  let replay = false;
  let recovery:
    | { current: number; target: URL; release: () => void }
    | undefined;
  let releaseError = () => {};
  let handedOff: number | undefined;
  const dataRouter = router as NavigationRouter &
    Partial<Pick<Router, "createFetcher" | "submit">>;
  const createFetcher = dataRouter.createFetcher;
  const submit = dataRouter.submit;
  const trackSubmission =
    (submit: Router["submit"]): Router["submit"] =>
    async (...args) => {
      state.sequence++;
      state.mutations++;
      const { data, error } = await safeWrapAsync(() => submit(...args));
      state.mutations--;
      await recover();
      if (error) throw error.cause ?? error;
      return data!;
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
    const target = new URL(href, read().url);
    const previous = new URL(read().url);
    const current = ++state.sequence;
    if (
      target.origin === location.origin &&
      (target.pathname !== previous.pathname ||
        target.search !== previous.search)
    ) {
      if (known(target) && (await reload(target, () => canReload(current))))
        return;
      void changed(target);
    }
    if (valid(current)) await navigate(href, operation);
  };
  const pop = async (event: PopStateEvent) => {
    if (replay) return;
    const target = new URL(location.href);
    const previous = new URL(read().url);
    const current = ++state.sequence;
    if (
      target.pathname === previous.pathname &&
      target.search === previous.search
    )
      return;
    if (!known(target) || !canReload(current)) {
      void changed(target);
      return;
    }
    event.stopImmediatePropagation();
    const reloaded = await reload(target, () => canReload(current));
    if (reloaded || !valid(current)) return;
    replay = true;
    window.dispatchEvent(new PopStateEvent("popstate", { state: event.state }));
    replay = false;
  };
  async function recover() {
    if (!recovery || state.mutations) return;
    const { current, target, release } = recovery;
    recovery = undefined;
    const reloaded = await reload(
      target,
      () =>
        canReload(current) &&
        read().state !== "submitting" &&
        read().url === target.href,
    );
    if (reloaded && !customReload) handedOff = current;
    else if (handedOff !== current) release();
  }
  const preloadError = async () => {
    // Speculative imports cannot claim recovery before navigation starts.
    if (read().state !== "loading") return;
    const current = state.sequence;
    const target = new URL(read().url);
    const release = holdRouteError(
      router,
      () => valid(current) && read().url === target.href,
    );
    releaseError = release;
    if ((await changed(target, true)) && valid(current)) {
      recovery = { current, target, release };
      await recover();
    } else release();
  };
  function cleanup() {
    if (stopped) return;
    if (state.cleanup === cleanup) state.cleanup = undefined;
    stopped = true;
    recovery = undefined;
    state.sequence++;
    releaseError();
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
  const result = await safeWrapAsync(async () => {
    const target = destination ?? new URL(location.href);
    return (await check.changed(target, true)) ? check.reload(target) : false;
  });
  check.dispose();
  if (result.error) throw result.error.cause ?? result.error;
  return result.data!;
}
