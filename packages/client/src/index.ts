/**
 * Optional browser transport for server loaders and actions.
 * @module
 */

import type {
  ClientActionArgs,
  ClientLoaderArgs,
  DataArgs,
  Route,
  RouteModule,
} from "@smolter/core";

export type { ClientActionArgs, ClientLoaderArgs } from "@smolter/core";
export { deserialize } from "./deserialize.ts";

/** Browser-safe route exports, excluding server implementation code. */
export interface ClientRouteModule {
  default?: unknown;
  HydrateFallback?: unknown;
  ErrorBoundary?: unknown;
  clientLoader?(args: ClientLoaderArgs): unknown;
  clientAction?(args: ClientActionArgs): unknown;
  shouldRevalidate?: RouteModule["shouldRevalidate"];
}

/** Select the server loader and action proxies available on a browser route. */
export interface ServerHandlers {
  loader?: boolean;
  action?: boolean;
}

/** Browser transport for server routes. File-router builds generate this call. */
export function serverRoute<M extends RouteModule = RouteModule>(
  path: string,
  module: ClientRouteModule,
  handlers: ServerHandlers = { loader: true, action: true },
): Route<M> {
  const remote = async ({ request, signal }: DataArgs) => {
    const url = new URL(request.url);
    const response = await fetch(
      `/_smolter?url=${encodeURIComponent(url.pathname + url.search)}`,
      {
        method: request.method,
        signal,
        ...(request.method !== "GET" && { body: await request.formData() }),
      },
    );
    const location = response.headers.get("X-Smolter-Redirect");

    if (location)
      return new Response(null, {
        status: 303,
        headers: { Location: location },
      });

    const data = await response.json();

    if (!response.ok) return new Error(data.error ?? "Route request failed");

    return data;
  };

  return {
    ...module,
    path,
    ...(handlers.loader && { loader: remote }),
    ...(handlers.action && { action: remote }),
    ...(module.clientLoader && {
      clientLoader: (args: DataArgs) =>
        module.clientLoader!({ ...args, serverLoader: () => remote(args) }),
    }),
    ...(module.clientAction && {
      clientAction: (args: DataArgs) => {
        const request = args.request.clone();

        return module.clientAction!({
          ...args,
          serverAction: () => remote({ ...args, request: request.clone() }),
        });
      },
    }),
  } as Route<M>;
}
