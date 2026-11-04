import type { DataArgs, Route, Router } from "@smolter/core";
import { createDataRouter, matchRoutes, safeWrapAsync } from "@smolter/core";
import { errorData } from "@smolter/core/errors";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { type DataResponse, normalizeResult } from "@smolter/core/responses";
import { loadRouter } from "@smolter/server";
import { deferredHydration } from "./deferred-hydration.ts";
import { dispatchRoute } from "./dispatch.ts";
import { requestPolicy } from "./request-policy.ts";

interface ServerRoot {
  loader?: (args: DataArgs) => unknown;
  ErrorBoundary?: unknown;
}

export interface RenderProps {
  router: Router;
  routes: (Route & { routePath?: string })[];
  root: unknown;
  entry: string;
  rootError: boolean;
  streaming: boolean;
  initialData?: string;
  document: boolean;
}

import { progressiveDocument } from "./progressive-document.ts";
import { resolveHydration, streamDocument } from "./stream-document.ts";

/** SSR settings for CSP nonce and early deferred-data hydration. */
export interface RenderApplicationOptions {
  nonce?: string;
  earlyHydration?: boolean;
}

/** Render a Preact application response with root and route data, streaming deferred content when enabled. */
export async function renderDocument(
  request: Request,
  routes: (Route & { routePath?: string })[],
  rootModule: ServerRoot,
  entry: string,
  options: RenderApplicationOptions,
  render: (
    props: RenderProps,
  ) =>
    | (ReadableStream<Uint8Array> & { allReady: Promise<unknown> })
    | Promise<ReadableStream<Uint8Array> & { allReady: Promise<unknown> }>,
): Promise<Response> {
  const denied = requestPolicy(request);
  if (denied) return denied;
  routes = routes.map((route) => ({
    ...route,
    path: route.routePath ?? route.path,
  }));
  const match = matchRoutes(routes, new URL(request.url).pathname);
  if (match && !match.route.default)
    return dispatchRoute(request, routes, true);
  let actionResponse: Response | undefined;
  let actionData: unknown;
  if (request.method !== "GET" && request.method !== "HEAD") {
    actionResponse = await dispatchRoute(request, routes, true);
    if (
      actionResponse.headers.has("Location") ||
      !actionResponse.headers.get("Content-Type")?.includes("application/json")
    )
      return actionResponse;
    actionData = await normalizeResult(await actionResponse.json());
  }
  let routeResponse: ResponseInit | undefined;
  let rootResponse: ResponseInit | undefined;
  function responseMetadata(value: unknown): ResponseInit | undefined {
    if (value instanceof Response) return value;
    if (value && typeof value === "object" && "__routeData" in value)
      return (value as DataResponse<unknown>).init;
  }
  const rootResult = safeWrapAsync(async () => {
    const { data, error } = await safeWrapAsync(async () => ({
      value: await rootModule.loader?.({
        request,
        params: {},
        signal: request.signal,
      }),
    }));
    rootResponse = responseMetadata(error ? error.cause : data!.value);
    if (!error) return normalizeResult(data!.value, false);
    const cause = error.cause;
    return cause instanceof Response
      ? normalizeResult(cause, false)
      : cause instanceof Error
        ? cause
        : new Error(String(cause), { cause });
  });
  let redirectResponse: Response | undefined;
  const prepared = prepareRoutes(
    routes.map((route) => ({
      ...route,
      ErrorBoundary: route.ErrorBoundary ?? rootModule.ErrorBoundary,
      ...(route.loader && {
        loader: async (args: DataArgs) => {
          const result = await safeWrapAsync(async () => ({
            value: await route.loader!(args),
          }));
          const cause = result.error?.cause;
          const value = result.error
            ? cause instanceof Error || cause instanceof Response
              ? cause
              : result.error
            : result.data!.value;
          routeResponse = responseMetadata(value);
          return value;
        },
      }),
    })),
    true,
  ).map((route) => {
    if (!route.loader) return route;
    const loader = route.loader;
    return {
      ...route,
      loader: async (args: Parameters<typeof loader>[0]) => {
        const value = await loader(args);
        if (value instanceof Response && value.headers.has("Location"))
          redirectResponse = value;
        return value;
      },
    };
  });
  const [rootState, loadedRouter] = await Promise.all([
    rootResult,
    loadRouter(prepared, request),
  ]);
  let router = loadedRouter;
  const rootError = rootState.error;
  const root = rootError ? undefined : rootState.data;
  if (root instanceof Response && root.headers.has("Location")) {
    router.dispose();
    return root;
  }
  if (redirectResponse) {
    router.dispose();
    return redirectResponse;
  }
  if (actionResponse || rootError) {
    const hydrationData = {
      ...router.getSnapshot(),
      actionData: actionData instanceof Error ? undefined : actionData,
      ...(actionData instanceof Error && { error: actionData }),
      ...(rootError && { error: rootError }),
    };
    router.dispose();
    router = createDataRouter(router.routes, { hydrationData });
  }
  const snapshot = router.getSnapshot();
  const hydrationData = {
    root,
    snapshot: {
      ...snapshot,
      error: snapshot.error && errorData(snapshot.error),
    },
    ...(rootError && { rootError: true }),
  };
  const deferred = options.earlyHydration
    ? deferredHydration(hydrationData, options.nonce)
    : undefined;
  const { data: stream, error: renderError } = await safeWrapAsync(() =>
    render({
      router,
      routes,
      root,
      entry,
      rootError: Boolean(rootError),
      streaming: true,
      initialData: deferred?.initial,
      document: true,
    }),
  );
  if (renderError) {
    router.dispose();
    await deferred?.stream.cancel();
    throw renderError.cause ?? renderError;
  }
  // The renderer reports the same rejection through its stream reader.
  void safeWrapAsync(() => stream!.allReady);
  const headers = new Headers(rootResponse?.headers);
  for (const metadata of [routeResponse, actionResponse]) {
    new Headers(metadata?.headers).forEach((value, key) => {
      if (key === "set-cookie") headers.append(key, value);
      else headers.set(key, value);
    });
  }
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(
    deferred
      ? progressiveDocument(stream!, deferred.stream, {
          signal: request.signal,
          dispose: () => router.dispose(),
        })
      : streamDocument(stream!, {
          hydration: resolveHydration(hydrationData),
          signal: request.signal,
          nonce: options.nonce,
          dispose: () => router.dispose(),
        }),
    {
      status: snapshot.error
        ? Number("status" in snapshot.error ? snapshot.error.status : 500)
        : (actionResponse?.status ??
          routeResponse?.status ??
          rootResponse?.status ??
          200),
      headers,
    },
  );
}
