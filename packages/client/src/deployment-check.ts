import { matchRoutes, safeWrapAsync } from "@smolter/core";
import type { DeploymentOptions } from "./deployment.ts";

type Manifest = Pick<DeploymentOptions, "version" | "shared" | "routes">;
function manifestValue(value: unknown): Manifest | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    typeof value.version !== "string" ||
    !value.version
  )
    return;
  if (!("shared" in value) && !("routes" in value))
    return { version: value.version };
  if (
    !("shared" in value) ||
    typeof value.shared !== "string" ||
    !("routes" in value) ||
    !Array.isArray(value.routes) ||
    !value.routes.every(
      (route) =>
        route &&
        typeof route === "object" &&
        typeof route.path === "string" &&
        typeof route.fingerprint === "string",
    )
  )
    return;
  return { version: value.version, shared: value.shared, routes: value.routes };
}
export function deploymentCheck(options: DeploymentOptions) {
  const { version, manifestURL, timeout = 2000 } = options;
  const manifest = new URL(manifestURL, location.href);
  const key = `smolter:deployment:${manifest.href}:${version}`;
  let stopped = false;
  let pending: Promise<Manifest | undefined> | undefined;
  let forced = false;
  let controller: AbortController | undefined;
  let cached: Manifest | undefined;
  let checked = 0;
  async function requestManifest() {
    controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), timeout);
    const { data } = await safeWrapAsync(async () => {
      const response = await fetch(manifest, {
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) return;
      return manifestValue(await response.json());
    });
    if (data) cached = data;
    checked = Date.now();
    clearTimeout(timer);
    pending = undefined;
    return data;
  }
  async function read(force: boolean): Promise<Manifest | undefined> {
    if (stopped) return;
    if (pending) {
      const wasForced = forced;
      const latest = await pending;
      return force && !wasForced && (!latest || latest.version === version)
        ? read(true)
        : latest;
    }
    if (
      !force &&
      checked &&
      Date.now() - checked < (options.checkInterval ?? 30_000)
    )
      return cached;
    forced = force;
    pending = requestManifest();
    return pending;
  }
  function differs(latest: Manifest | undefined, target?: URL, force = false) {
    if (!latest || latest.version === version) return false;
    if (
      force ||
      !target ||
      !options.shared ||
      !options.routes ||
      latest.shared !== options.shared ||
      !latest.routes
    )
      return true;
    const before = matchRoutes(options.routes, target.pathname)?.route as
      | { fingerprint?: string }
      | undefined;
    const after = matchRoutes(latest.routes, target.pathname)?.route as
      | { fingerprint?: string }
      | undefined;
    return !before || !after || before.fingerprint !== after.fingerprint;
  }
  async function reload(target: URL, current: () => boolean = () => true) {
    // Claim recovery only after checking ownership and active submissions.
    const { data } = await safeWrapAsync(() => {
      if (stopped || !current() || sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      if (options.reload) options.reload(target);
      else if (target.href === location.href) location.reload();
      else location.assign(target.href);
      return true;
    });
    return data ?? false;
  }
  return {
    changed: async (target?: URL, force = false) =>
      differs(await read(force), target, force),
    known: (target: URL) => differs(cached, target),
    reload,
    dispose() {
      stopped = true;
      controller?.abort();
    },
  };
}
