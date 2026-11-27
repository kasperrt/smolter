import {
  enableNestedCapability,
  type NestedRouterOptions,
  resolveBranchURL,
} from "./branch.ts";
import { safeWrapAsync } from "./errors.ts";
import { compareRoutePaths } from "./match.ts";
import { prepareRoutes } from "./prepare-routes.ts";
import { createDataRouter } from "./router.ts";
import type { DataArgs, Route, RouteModule, Router } from "./types.ts";

/** Lazily loaded nested route exports, including route handle metadata. */
interface NestedRouteModule extends RouteModule {
  handle?: unknown;
}

/** Absolute route patterns with explicit parent identity; omitted from flat builds. */
export interface NestedRoute extends Route {
  id: string;
  parentId?: string;
  index?: boolean;
  pathless?: boolean;
  handle?: unknown;
  preload?: () => Promise<void>;
  lazy?: () => Promise<NestedRouteModule>;
  /** This layout's index route is protected and joins through route discovery. */
  discoverIndex?: boolean;
}

/** A matchable leaf with the chain of nested routes it renders. */
interface BranchRoute extends Route {
  branch: NestedRoute[];
}

/** Loader values belonging to one committed route branch. */
export interface BranchData {
  matches: string[];
  values: Record<string, unknown>;
}

/** A failure retains successful ancestor values for the nearest error boundary. */
export interface BranchError extends Error {
  routeId: string;
  branch: BranchData;
}

export type { NestedRouterOptions } from "./branch.ts";

/** Create a router using the normal navigation, mutation and cancellation engine. */
export function createNestedRouter(
  definitions: readonly NestedRoute[],
  options: NestedRouterOptions = {},
): Router {
  enableNestedCapability();
  const nodes = new Map<string, NestedRoute>();
  const listeners = new Set<() => void>();
  const prepared = new Map<string, Route>();
  const pending = new Map<string, Promise<void>>();
  const branches = new Map<string, NestedRoute[]>();
  function addNode(definition: NestedRoute): NestedRoute {
    const node = { ...definition };
    const preload = node.preload;
    async function load() {
      const result = await safeWrapAsync(async () => {
        await preload?.();
        if (node.lazy) Object.assign(node, await node.lazy());
        prepared.set(node.id, prepareRoutes([node])[0]);
        for (const listener of listeners) listener();
      });
      if (!result.error) return;
      pending.delete(node.id);
      throw result.error.cause ?? result.error;
    }
    node.preload = () => {
      if (!pending.has(node.id)) pending.set(node.id, load());
      return pending.get(node.id)!;
    };
    nodes.set(node.id, node);
    return node;
  }
  function chainFor(route: NestedRoute): NestedRoute[] {
    const chain = [route];
    const seen = new Set([route.id]);
    let parentId = route.parentId;
    while (parentId) {
      const parent = nodes.get(parentId);
      if (!parent || seen.has(parentId))
        throw new Error(`Invalid route parent: ${parentId}`);
      seen.add(parentId);
      chain.unshift(parent);
      parentId = parent.parentId;
    }
    return chain;
  }
  function redirectResult(value: unknown, current: string) {
    if (
      !(value instanceof Response) ||
      !value.headers.has("Location") ||
      !options.basename
    )
      return value;
    const location = value.headers.get("Location")!;
    if (!URL.canParse(location, current)) return value;
    const destination = new URL(location, current);
    const base = options.basename.replace(/\/$/, "");
    if (
      destination.origin !== new URL(current).origin ||
      destination.pathname === base ||
      destination.pathname.startsWith(`${base}/`)
    )
      return value;
    resolveBranchURL(destination, base);
    const headers = new Headers(value.headers);
    headers.set("Location", destination.href);
    return new Response(null, { status: value.status, headers });
  }
  let committed: BranchData | undefined;
  let committedURL: string | undefined;
  function leafRoute(route: NestedRoute): BranchRoute {
    const chain = branches.get(route.id)!;
    const run = async (args: DataArgs, mutation = false) => {
      const revalidation = args.revalidation;
      const leaf = new URL(args.request.url).searchParams.has("index")
        ? route
        : ([...chain].reverse().find((item) => !item.index && !item.pathless) ??
          route);
      if (mutation || args.reason === "fetcher") {
        const target = leaf;
        await target.preload?.();
        const module = prepared.get(target.id)!;
        const handler = mutation
          ? (module.clientAction ?? module.action)
          : (module.clientLoader ?? module.loader);
        if (!handler) return mutation ? new Error("No action") : undefined;
        const result = await safeWrapAsync(() =>
          handler({
            ...args,
            serverLoader: async () => module.loader?.(args),
            serverAction: async () => module.action?.(args),
          }),
        );
        if (result.error)
          return Object.assign(result.error, {
            routeId: target.id,
            branch: committed ?? {
              matches: chain.map((node) => node.id),
              values: {},
            },
          });
        return redirectResult(result.data, args.request.url);
      }
      const previous = committed;
      const currentUrl = new URL(committedURL ?? args.request.url);
      const nextUrl = new URL(args.request.url);
      const results = await Promise.all(
        chain.map(async (node) => {
          const result = await safeWrapAsync(async () => {
            await node.preload?.();
            const module = prepared.get(node.id)!;
            const reusable =
              previous?.matches.includes(node.id) &&
              Object.hasOwn(previous.values, node.id);
            if (
              reusable &&
              revalidation?.targets &&
              !revalidation.targets.includes(node.id) &&
              !revalidation.targets.includes(node.path)
            )
              return previous!.values[node.id];
            const changed =
              currentUrl.pathname !== nextUrl.pathname ||
              currentUrl.search !== nextUrl.search;
            if (
              reusable &&
              // A hash-only navigation reuses loaded layout data.
              ((!revalidation &&
                !changed &&
                currentUrl.hash !== nextUrl.hash) ||
                module.shouldRevalidate?.(
                  revalidation ?? {
                    currentUrl,
                    nextUrl,
                    url: nextUrl,
                    reason: "navigation",
                    defaultShouldRevalidate: changed,
                  },
                ) === false)
            )
              return previous!.values[node.id];
            const handler = module.clientLoader ?? module.loader;
            return handler?.({
              ...args,
              serverLoader: async () => module.loader?.(args),
            });
          });
          return { id: node.id, ...result };
        }),
      );
      const branch: BranchData = {
        matches: chain.map((node) => node.id),
        values: {},
      };
      for (const result of results) {
        if (result.error)
          return Object.assign(result.error, { routeId: result.id, branch });
        if (
          result.data instanceof Response &&
          result.data.headers.has("Location")
        )
          return redirectResult(result.data, args.request.url);
        Object.defineProperty(branch.values, result.id, {
          value: result.data,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return branch;
    };
    return {
      ...route,
      clientLoader: (args: DataArgs) => run(args),
      clientAction: (args: DataArgs) => run(args, true),
      branch: chain,
      revalidationIds: chain.flatMap((node) => [node.id, node.path]),
      shouldRevalidate: () => true,
    };
  }
  // Index routes, and layouts whose index is discovered later, are not matched directly.
  const isLeaf = (route: NestedRoute) =>
    !route.discoverIndex &&
    ![...nodes.values()].some(
      (child) => child.parentId === route.id && child.index,
    );
  function register(definitions: readonly NestedRoute[]): BranchRoute[] {
    const added = definitions
      .filter((definition) => !nodes.has(definition.id))
      .map(addNode);
    for (const route of added) branches.set(route.id, chainFor(route));
    return added.filter(isLeaf).map(leafRoute);
  }
  const routes = register(definitions);
  routes.sort(
    (left, right) =>
      compareRoutePaths(left.path, right.path) ||
      right.branch.length - left.branch.length,
  );
  const discover = options.discover;
  const router = createDataRouter(routes, {
    ...options,
    ...(discover && {
      discover: {
        attach: (table, host, cache) =>
          discover.attach(table, host, cache, register),
      },
    }),
  });
  const subscribe = router.subscribe;
  router.subscribe = (listener) => {
    listeners.add(listener);
    const unsubscribe = subscribe(listener);
    return () => {
      listeners.delete(listener);
      unsubscribe();
    };
  };
  const read = router.getSnapshot;
  const unsubscribe = router.subscribe(() => {
    const snapshot = read();
    if (!snapshot.loaded || snapshot.error || snapshot.state !== "idle") return;
    committed = snapshot.data as BranchData;
    committedURL = snapshot.url;
  });
  const dispose = router.dispose;
  router.dispose = () => {
    unsubscribe();
    listeners.clear();
    dispose();
  };
  return router;
}
