import {
  type DiscoveredRoute,
  type Route,
  type RouteDiscovery,
  type RouteDiscoveryResponse,
  safeWrapAsync,
} from "@smolter/core";
import { withRouteDiscovery } from "@smolter/core/discovery";
import { leaveDocument } from "@smolter/core/environment";
import { discoverySuffix } from "@smolter/core/namespace";
import type { NestedRoute } from "@smolter/core/nested";

/** Browser exports of a discovered route module. */
export type DiscoveredModule = Record<string, unknown>;

/** Convert one discovered definition, with its module loader, into a router route. */
export type DiscoveredRouteFactory<R extends Route> = (
  route: DiscoveredRoute,
  load: () => Promise<DiscoveredModule>,
) => R;

const capabilityNames = new Set([
  "loader",
  "action",
  "clientAction",
  "meta",
  "shouldRevalidate",
  "ErrorBoundary",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

// Module and stylesheet URLs must be ordinary web URLs, never script or data URLs.
function webURL(value: unknown): value is string {
  if (typeof value !== "string" || !URL.canParse(value, location.href))
    return false;
  const { protocol } = new URL(value, location.href);
  return protocol === "https:" || protocol === "http:";
}

function isDiscoveredRoute(value: unknown): value is DiscoveredRoute {
  if (!isRecord(value) || !isRecord(value.capabilities)) return false;
  const capabilities = Object.entries(value.capabilities);
  return (
    typeof value.path === "string" &&
    value.path.startsWith("/") &&
    optionalString(value.id) &&
    optionalString(value.parentId) &&
    optionalBoolean(value.index) &&
    optionalBoolean(value.pathless) &&
    capabilities.every(([name, flag]) =>
      name === "dataEndpoint"
        ? typeof flag === "string" && flag.startsWith("/")
        : capabilityNames.has(name) && typeof flag === "boolean",
    ) &&
    webURL(value.file) &&
    Array.isArray(value.exports) &&
    value.exports.every(
      (name) => typeof name === "string" && /^[A-Za-z_$][\w$]*$/.test(name),
    ) &&
    Array.isArray(value.styles) &&
    value.styles.every(webURL)
  );
}

function isDiscoveryResponse(value: unknown): value is RouteDiscoveryResponse {
  return (
    isRecord(value) &&
    typeof value.build === "string" &&
    Array.isArray(value.routes) &&
    value.routes.every(isDiscoveredRoute)
  );
}

function loadStyle(href: string): Promise<void> {
  const url = new URL(href, location.href).href;
  const existing = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ].some((link) => link.href === url);
  if (existing) return Promise.resolve();
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  // A failed stylesheet must not block the route; the module still renders.
  const settled = new Promise<void>((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
  document.head.append(link);
  return settled;
}

async function loadModule(route: DiscoveredRoute): Promise<DiscoveredModule> {
  await Promise.all(route.styles.map(loadStyle));
  const { data, error } = await safeWrapAsync(
    (): Promise<DiscoveredModule> => import(/* @vite-ignore */ route.file),
  );
  if (error) {
    // Reuse deployment recovery: a missing chunk usually means a newer deployment.
    dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    throw error.cause ?? error;
  }
  return Object.fromEntries(
    route.exports
      .filter((name) => Object.hasOwn(data!, name))
      .map((name) => [name, data![name]]),
  );
}

/** Ask the server for authorized routes matching an unknown URL. */
export function createDiscoveryClient<R extends Route>(
  build: string,
  toRoute: DiscoveredRouteFactory<R>,
): RouteDiscovery<R> {
  return withRouteDiscovery(async (url, { signal, navigation }) => {
    const response = await fetch(`${url.pathname}${discoverySuffix()}`, {
      mode: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (!isDiscoveryResponse(body)) return [];
    if (body.build !== build) {
      // A page navigation loads the new deployment's document; data requests never replay writes.
      if (navigation) leaveDocument(url);
      return [];
    }
    return body.routes.map((route) => toRoute(route, () => loadModule(route)));
  });
}

/** Route discovery for nested file routes. */
export function nestedRouteDiscovery(
  build: string,
): RouteDiscovery<NestedRoute> {
  return createDiscoveryClient(build, (route, load) => ({
    path: route.path,
    id: route.id ?? route.path,
    ...(route.parentId && { parentId: route.parentId }),
    ...(route.index && { index: true }),
    ...(route.pathless && { pathless: true }),
    lazy: load,
  }));
}
