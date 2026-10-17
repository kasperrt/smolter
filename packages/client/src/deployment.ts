import type { NavigationRouter } from "@smolter/core";

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

  const { version, manifestURL, timeout = 2000 } = options;
  const navigate = router.navigate;
  const dispose = router.dispose;
  const manifest = new URL(manifestURL, location.href);
  const key = `smolter:deployment:${manifest.href}:${version}`;
  let sequence = 0;
  let stopped = false;
  let replay = false;
  let destination = new URL(location.href);
  let pending: Promise<boolean> | undefined;
  let controller: AbortController | undefined;

  function changed() {
    if (pending) return pending;

    controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), timeout);
    pending = fetch(manifest, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;

        const data: unknown = await response.json();

        return (
          typeof data === "object" &&
          data !== null &&
          "version" in data &&
          typeof data.version === "string" &&
          data.version.length > 0 &&
          data.version !== version
        );
      })
      .catch(() => false)
      .finally(() => {
        clearTimeout(timer);
        pending = undefined;
      });

    return pending;
  }

  async function reload(target: URL) {
    // If storage is unavailable, do not risk reloading the same cached document forever.
    const allowed = await Promise.resolve()
      .then(() => {
        if (sessionStorage.getItem(key)) return false;

        sessionStorage.setItem(key, "1");

        return true;
      })
      .catch(() => false);

    if (allowed && !stopped) {
      if (options?.reload) options.reload(target);
      if (!options?.reload) {
        if (target.href === location.href) location.reload();
        if (target.href !== location.href) location.assign(target.href);
      }
    }

    return allowed && !stopped;
  }

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
    if (router.getSnapshot().state === "submitting") return;

    const current = sequence;
    const target = destination;
    void changed().then((updated) => {
      if (updated && current === sequence && !stopped) return reload(target);
    });
  };

  function cleanup() {
    stopped = true;
    sequence++;
    controller?.abort();
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
