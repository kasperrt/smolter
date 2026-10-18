import { matchRoutes, type Route, safeWrapAsync } from "@smolter/core";
import {
  type DataResponse,
  normalizeResult,
  resolveData,
} from "@smolter/core/responses";
import { privateResponse } from "./private-response.ts";

async function dispatch(
  request: Request,
  routes: readonly (Route & { routePath?: string })[],
  document = false,
): Promise<Response> {
  const match = matchRoutes(
    routes.map((route) => ({ ...route, path: route.routePath ?? route.path })),
    new URL(request.url).pathname,
  );
  if (!match) return Response.json({ error: "No route" }, { status: 404 });
  const handler =
    request.method === "GET" || request.method === "HEAD"
      ? match.route.loader
      : match.route.action;
  if (!handler) return Response.json({ error: "No handler" }, { status: 405 });
  const { data, error } = await safeWrapAsync(async () => ({
    value: await handler({
      request,
      params: match.params,
      signal: request.signal,
    }),
  }));
  const value = error ? error.cause : data!.value;
  if (value instanceof Response) {
    const location = value.headers.get("Location");
    if (document) return value;
    if (!location) {
      if (value.ok) return value;
      return Response.json({
        __routeError: {
          message: await value.text(),
          status: value.status,
          statusText: value.statusText,
        },
      });
    }
    const headers = new Headers(value.headers);
    headers.delete("Location");
    headers.set("X-Smolter-Redirect", location);
    return new Response(null, { headers });
  }
  if (value instanceof Error)
    return Response.json({
      __routeError: { ...value, message: value.message },
    });
  if (value && typeof value === "object" && "__routeData" in value) {
    const result = value as DataResponse<unknown>;
    return Response.json(
      await resolveData(result.value),
      document ? result.init : { headers: result.init.headers },
    );
  }
  return Response.json((await normalizeResult(value)) ?? null);
}

/** Dispatch a normalized application URL to its route loader or action and return an HTTP response. */
export async function dispatchRoute(
  request: Request,
  routes: readonly (Route & { routePath?: string })[],
  document = false,
): Promise<Response> {
  const response = await dispatch(request, routes, document);
  return document ? response : privateResponse(response);
}
