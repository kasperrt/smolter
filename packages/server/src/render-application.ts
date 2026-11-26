import type { DataArgs, Router } from "@smolter/core";
import { createDataRouter, matchRoutes, safeWrapAsync } from "@smolter/core";
import { errorData } from "@smolter/core/errors";
import { namespace } from "@smolter/core/namespace";
import { type DataResponse, normalizeResult } from "@smolter/core/responses";
import { loadRouter } from "@smolter/server";
import { deferredHydration } from "./deferred-hydration.ts";
import { dispatchRoute, type ServerRoute } from "./dispatch.ts";
import { privateHeaders, privateResponse } from "./private-response.ts";
import { progressiveDocument } from "./progressive-document.ts";
import { requestPolicy } from "./request-policy.ts";
import { resolveHydration, streamDocument } from "./stream-document.ts";

const routeDataMarker = Symbol.for(`${namespace}.routeData`);

function isRouteData(value: unknown): value is DataResponse<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Reflect.get(value, routeDataMarker) === true,
  );
}

interface ServerRoot {
  loader?: (args: DataArgs) => unknown;
  ErrorBoundary?: unknown;
}

export interface RenderProps {
  router: Router;
  routes: ServerRoute[];
  root: unknown;
  entry: string;
  rootError: boolean;
  streaming: boolean;
  initialData?: string;
  document: boolean;
}

/** SSR settings for CSP nonce and early deferred-data hydration. */
export interface RenderApplicationOptions {
  nonce?: string;
  earlyHydration?: boolean;
}

interface RendererStream extends ReadableStream<Uint8Array> {
  allReady: Promise<unknown>;
}

type RenderDocumentStream = (
  props: RenderProps,
) => RendererStream | Promise<RendererStream>;

/** Render a Preact application response with root and route data, streaming deferred content when enabled. */
export async function renderDocument(
  request: Request,
  routes: ServerRoute[],
  rootModule: ServerRoot,
  entry: string,
  options: RenderApplicationOptions,
  render: RenderDocumentStream,
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
      return privateResponse(actionResponse);
    actionData = await normalizeResult(await actionResponse.json());
  }
  let routeResponse: ResponseInit | undefined;
  let rootResponse: ResponseInit | undefined;
  function responseMetadata(value: unknown): ResponseInit | undefined {
    if (value instanceof Response) return value;
    if (isRouteData(value)) return value.init;
  }
  const rootResult = rootModule.loader
    ? safeWrapAsync(async () => {
        const { data, error } = await safeWrapAsync(async () => ({
          value: await rootModule.loader!({
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
      })
    : Promise.resolve({ data: undefined, error: undefined });
  let redirectResponse: Response | undefined;
  const prepared = routes.slice();
  if (match) {
    const matchIndex = routes.indexOf(match.route);
    const matchLoader = match.route.loader;
    prepared[matchIndex] = {
      ...match.route,
      ErrorBoundary: match.route.ErrorBoundary ?? rootModule.ErrorBoundary,
      ...(matchLoader && {
        loader: async (args: DataArgs) => {
          const result = await safeWrapAsync(async () => ({
            value: await matchLoader(args),
          }));
          const cause = result.error?.cause;
          const raw = result.error
            ? cause instanceof Error || cause instanceof Response
              ? cause
              : result.error
            : result.data!.value;
          routeResponse = responseMetadata(raw);
          const value = await normalizeResult(raw, false);
          if (value instanceof Response && value.headers.has("Location")) {
            redirectResponse = value;
            return undefined;
          }
          return value;
        },
      }),
    };
  }
  const [rootState, loadedRouter] = await Promise.all([
    rootResult,
    loadRouter(prepared, request),
  ]);
  let router = loadedRouter;
  const rootError = rootState.error;
  const root = rootError ? undefined : rootState.data;
  if (root instanceof Response && root.headers.has("Location")) {
    router.dispose();
    return privateResponse(root);
  }
  if (redirectResponse) {
    router.dispose();
    return privateResponse(redirectResponse);
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
      if (key === "set-cookie") return headers.append(key, value);
      headers.set(key, value);
    });
  }
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "text/html; charset=utf-8");
  privateHeaders(headers);
  const errorStatus =
    snapshot.error &&
    "status" in snapshot.error &&
    typeof snapshot.error.status === "number" &&
    Number.isInteger(snapshot.error.status) &&
    snapshot.error.status >= 200 &&
    snapshot.error.status <= 599
      ? snapshot.error.status
      : 500;
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
        ? errorStatus
        : (actionResponse?.status ??
          routeResponse?.status ??
          rootResponse?.status ??
          200),
      headers,
    },
  );
}
