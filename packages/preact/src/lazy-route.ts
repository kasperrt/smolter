/**
 * On-demand Preact route modules with shared intent prefetching.
 *
 * @module
 */
import { serverRoute } from "@smolter/client";
import {
  type DataArgs,
  type RouteModule,
  type Router,
  safeWrapAsync,
} from "@smolter/core";
import { type ComponentType } from "preact";
import { useRouter } from "./context.ts";
import type { AppRoute } from "./route-types.ts";
import type { ErrorProps } from "./routes.ts";
import { createElement, useSyncExternalStore } from "./runtime.ts";

/** Lazy route path, server transport endpoint and available handler capabilities. */
export interface LazyRouteOptions {
  path: string;
  dataEndpoint?: string;
  id?: string;
  loader?: boolean;
  action?: boolean;
  clientAction?: boolean;
  meta?: boolean;
  shouldRevalidate?: boolean;
  ErrorBoundary?: boolean;
}

type LoadedRoute = RouteModule & Pick<AppRoute, "meta">;

interface LazyAppRoute extends AppRoute {
  resolveComponent: () => ComponentType | undefined;
}

// A shared wrapper preserves component identity across routes using the same view.
function LazyView() {
  const router = useRouter<Router>();
  const { path } = useSyncExternalStore(router.subscribe, router.getSnapshot);
  const route = router.routes.find((item) => item.path === path) as
    | LazyAppRoute
    | undefined;
  const Component = route?.resolveComponent();
  return Component && createElement(Component, {});
}

/** Create a route that imports its module on demand and shares the import with intent prefetching. */
export function lazyRoute(
  options: LazyRouteOptions,
  importer: () => Promise<LoadedRoute>,
): LazyAppRoute {
  let module: LoadedRoute | undefined;
  let pending: Promise<void> | undefined;
  async function load() {
    const { error } = await safeWrapAsync(async () => {
      module = serverRoute(options.path, await importer(), {
        loader: options.loader,
        action: options.action,
        dataEndpoint: options.dataEndpoint,
      });
    });
    if (error) {
      pending = undefined;
      throw error.cause ?? error;
    }
  }
  function preload() {
    pending ??= load();
    return pending;
  }
  async function run(args: DataArgs, action = false) {
    await preload();
    if (args.signal.aborted) return new Error("Navigation cancelled");
    const handler = action
      ? (module!.clientAction ?? module!.action)
      : (module!.clientLoader ?? module!.loader);
    // serverRoute supplies serverLoader/serverAction to client handlers.
    return (handler as ((args: DataArgs) => unknown) | undefined)?.(args);
  }
  function ErrorBoundary({ error }: ErrorProps) {
    const Component = module?.ErrorBoundary as
      | ComponentType<ErrorProps>
      | undefined;
    if (!Component) return error.message;
    return createElement(Component, { error });
  }
  return {
    path: options.path,
    id: options.id,
    preload,
    default: LazyView,
    resolveComponent: () => module?.default as ComponentType | undefined,
    clientLoader: (args) => run(args),
    ...((options.action || options.clientAction) && {
      clientAction: (args: DataArgs) => run(args, true),
    }),
    ...(options.meta && { meta: (args) => module?.meta?.(args) ?? [] }),
    ...(options.shouldRevalidate && {
      shouldRevalidate: (args) => module?.shouldRevalidate?.(args) ?? true,
    }),
    ...(options.ErrorBoundary && { ErrorBoundary }),
  };
}
