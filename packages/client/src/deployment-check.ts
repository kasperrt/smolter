import type { DeploymentOptions } from "./deployment.ts";

export function deploymentCheck(options: DeploymentOptions) {
  const { version, manifestURL, timeout = 2000 } = options;
  const manifest = new URL(manifestURL, location.href);
  const key = `smolter:deployment:${manifest.href}:${version}`;
  let stopped = false;
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

  function reload(target: URL, current: () => boolean = () => true) {
    // Validate and claim recovery in the same task: stale checks must not consume
    // the marker or reload after a newer navigation or mutation has started.
    return Promise.resolve()
      .then(() => {
        if (stopped || !current() || sessionStorage.getItem(key)) return false;

        sessionStorage.setItem(key, "1");

        if (options.reload) options.reload(target);
        if (!options.reload) {
          if (target.href === location.href) location.reload();
          if (target.href !== location.href) location.assign(target.href);
        }

        return true;
      })
      .catch(() => false);
  }

  return {
    changed,
    reload,
    dispose() {
      stopped = true;
      controller?.abort();
    },
  };
}
