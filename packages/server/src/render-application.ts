import type { DataArgs, Route, Router } from "@smolter/core";
import { createDataRouter, matchRoutes, safeWrapAsync } from "@smolter/core";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { normalizeResult } from "@smolter/core/responses";
import { loadRouter } from "@smolter/server";
import { deferredHydration } from "./deferred-hydration.ts";
import { dispatchRoute } from "./dispatch.ts";

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

  const rootResult = safeWrapAsync(() =>
    Promise.resolve()
      .then(() =>
        rootModule.loader?.({ request, params: {}, signal: request.signal }),
      )
      .then(
        (value) => normalizeResult(value, false),
        (error: unknown) =>
          error instanceof Response
            ? normalizeResult(error, false)
            : error instanceof Error
              ? error
              : new Error(String(error), { cause: error }),
      ),
  );
  let redirectResponse: Response | undefined;
  const prepared = prepareRoutes(
    routes.map((route) => ({
      ...route,
      ErrorBoundary: route.ErrorBoundary ?? rootModule.ErrorBoundary,
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
  const rootError =
    rootState.error ??
    (rootState.data instanceof Error ? rootState.data : undefined);
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
      error: snapshot.error && {
        ...snapshot.error,
        name: snapshot.error.name,
        message: snapshot.error.message,
      },
    },
    ...(rootError && { rootError: true }),
  };
  const deferred = options.earlyHydration
    ? deferredHydration(hydrationData, options.nonce)
    : undefined;
  const stream = await Promise.resolve()
    .then(() =>
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
    )
    .catch(async (error: unknown) => {
      router.dispose();
      await deferred?.stream.cancel();
      throw error;
    });
  // The renderer reports the same rejection through its stream reader.
  void stream.allReady.catch(() => {});
  const headers = new Headers(actionResponse?.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(
    deferred
      ? progressiveDocument(stream, deferred.stream, {
          signal: request.signal,
          dispose: () => router.dispose(),
        })
      : streamDocument(stream, {
          hydration: resolveHydration(hydrationData),
          signal: request.signal,
          nonce: options.nonce,
          dispose: () => router.dispose(),
        }),
    {
      status: snapshot.error
        ? Number("status" in snapshot.error ? snapshot.error.status : 500)
        : (actionResponse?.status ?? 200),
      headers,
    },
  );
}
