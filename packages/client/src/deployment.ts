import type { NavigationRouter } from "@smolter/core";
import { deploymentCheck } from "./deployment-check.ts";

/** Build identity and the fresh, non-cacheable manifest URL emitted by deploymentPlugin. */
export interface DeploymentOptions {
  version: string;
  manifestURL: string;
  /** Maximum time to wait for the update check before continuing navigation. */
  timeout?: number;
  /** Override document navigation, for example to ask about unsaved changes. */
  reload?: (destination: URL) => void;
}

/** Check for deployment changes before navigation. Returns a cleanup function. */
export function watchDeployment(
  router: NavigationRouter,
  options: DeploymentOptions | null,
): () => void {
  if (!options || typeof window === "undefined") return () => {};

  const check = deploymentCheck(options);
  const { changed, reload } = check;
  const navigate = router.navigate;
  const dispose = router.dispose;
  let sequence = 0;
  let stopped = false;
  let replay = false;
  let destination = new URL(location.href);

  const guarded: NavigationRouter["navigate"] = async (href, operation) => {
    const target = new URL(href, router.getSnapshot().url);
    const currentURL = new URL(router.getSnapshot().url);
    const current = ++sequence;
    destination = target;

    if (
      target.origin === location.origin &&
      (target.pathname !== currentURL.pathname ||
        target.search !== currentURL.search) &&
      (await changed())
    ) {
      if (current !== sequence || stopped || (await reload(target))) return;
    }

    if (current === sequence && !stopped) await navigate(href, operation);
  };

  const pop = (event: PopStateEvent) => {
    if (replay) return;

    const target = new URL(location.href);
    const previous = new URL(router.getSnapshot().url);

    if (
      target.pathname === previous.pathname &&
      target.search === previous.search
    )
      return;

    event.stopImmediatePropagation();
    const current = ++sequence;
    destination = target;
    void changed().then(async (updated) => {
      if (stopped || current !== sequence) return;
      if (updated && (await reload(target))) return;

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
    if (router.getSnapshot().state !== "loading") return;

    const current = sequence;
    const target = destination;
    void changed().then((updated) => {
      if (updated && current === sequence && !stopped) return reload(target);
    });
  };

  function cleanup() {
    stopped = true;
    sequence++;
    check.dispose();
    window.removeEventListener("popstate", pop, true);
    window.removeEventListener("vite:preloadError", preloadError);

    if (router.navigate === guarded) router.navigate = navigate;
    if (router.dispose === guardedDispose) router.dispose = dispose;
  }

  function guardedDispose() {
    cleanup();
    dispose();
  }

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
