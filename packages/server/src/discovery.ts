import {
  type DiscoveredRoute,
  matchRoutes,
  type RouteDiscoveryResponse,
  safeWrapAsync,
} from "@smolter/core";
import { compareRoutePaths } from "@smolter/core/match";
import { discoverySuffix } from "@smolter/core/namespace";
import { privateResponse } from "./private-response.ts";

/** One route in the private discovery manifest; protected routes carry their browser definition. */
export interface DiscoveryManifestRoute {
  path: string;
  id?: string;
  parentId?: string;
  index?: boolean;
  pathless?: boolean;
  /** Present only for protected routes, which are absent from public browser output. */
  route?: DiscoveredRoute;
}

/** Private build artifact listing every route in match order. Keep it outside public output. */
export interface RouteDiscoveryManifest {
  build: string;
  nested: boolean;
  routes: DiscoveryManifestRoute[];
}

/** The protected route a discovery request would reveal. */
export interface ProtectedRoute {
  id?: string;
  path: string;
}

/** Decide whether this request may learn about a protected route. Loaders and actions still authorize their own data. */
export type RouteAuthorizer = (
  request: Request,
  route: ProtectedRoute,
) => boolean | Promise<boolean>;

/** Private route manifest and host authorization for route discovery. */
export interface RouteDiscoveryOptions {
  manifest: RouteDiscoveryManifest;
  authorize: RouteAuthorizer;
}

interface ManifestBranch {
  path: string;
  chain: DiscoveryManifestRoute[];
}

/** The route pathname of a discovery request, or undefined for other requests. */
export function discoveryTarget(
  url: URL,
  suffix: string = discoverySuffix(),
): string | Error | undefined {
  if (!url.pathname.endsWith(suffix)) return;
  const path = url.pathname.slice(0, -suffix.length) || "/";
  if (!path.startsWith("/") || path.startsWith("//") || /[\\]/.test(path))
    return new Error("Invalid route URL");
  return path;
}

function isManifest(value: unknown): value is RouteDiscoveryManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<RouteDiscoveryManifest>;
  return (
    typeof manifest.build === "string" &&
    typeof manifest.nested === "boolean" &&
    Array.isArray(manifest.routes) &&
    manifest.routes.every(
      (route) => typeof route?.path === "string" && route.path.startsWith("/"),
    )
  );
}

// Mirror the browser: flat routes match in order; nested leaves carry their layout chain.
function branchesOf(manifest: RouteDiscoveryManifest): ManifestBranch[] {
  if (!manifest.nested)
    return manifest.routes.map((route) => ({
      path: route.path,
      chain: [route],
    }));
  const byId = new Map(manifest.routes.map((route) => [route.id, route]));
  return manifest.routes
    .filter(
      (route) =>
        !manifest.routes.some(
          (child) => child.parentId === route.id && child.index,
        ),
    )
    .map((route) => {
      const chain = [route];
      let parent = route.parentId && byId.get(route.parentId);
      while (parent && !chain.includes(parent)) {
        chain.unshift(parent);
        parent = parent.parentId && byId.get(parent.parentId);
      }
      return { path: route.path, chain };
    })
    .sort(
      (left, right) =>
        compareRoutePaths(left.path, right.path) ||
        right.chain.length - left.chain.length,
    );
}

function denied(): Response {
  return privateResponse(Response.json({ routes: [] }, { status: 404 }));
}

/** Answer a route discovery request with only the protected routes this request may see. */
export function createRouteDiscovery({
  manifest,
  authorize,
}: RouteDiscoveryOptions): (
  request: Request,
  path: string,
) => Promise<Response> {
  if (!isManifest(manifest))
    throw new TypeError(
      "routeDiscovery.manifest is not a route discovery manifest",
    );
  const branches = branchesOf(manifest);
  return async (request, path) => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    const branch = matchRoutes(branches, path)?.route as
      | ManifestBranch
      | undefined;
    const protectedRoutes = branch?.chain.filter((route) => route.route) ?? [];
    if (!protectedRoutes.length) return denied();
    // Every protected route in the chain must be allowed; failures deny without detail.
    const { data: allowed } = await safeWrapAsync(async () => {
      for (const route of protectedRoutes) {
        if (!(await authorize(request, { id: route.id, path: route.path })))
          return false;
      }
      return true;
    });
    if (!allowed) return denied();
    const body: RouteDiscoveryResponse = {
      build: manifest.build,
      routes: protectedRoutes.map((route) => route.route!),
    };
    return privateResponse(Response.json(body));
  };
}
