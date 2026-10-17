/** @jsxImportSource preact */

import { createDataRouter, matchRoutes } from "@smolter/core";
import {
  type DataResponse,
  normalizeResult,
  resolveData,
} from "@smolter/core/responses";
import type { AppRoute, RootModule } from "@smolter/preact/route-types";
import { prepareRoutes, RouterApplication } from "@smolter/preact/router";
import { loadRouter } from "@smolter/server";
import { renderToStringAsync } from "preact-render-to-string";

export async function renderApplication(
  request: Request,
  routes: AppRoute[],
  rootModule: RootModule,
  entry: string,
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

  const root = await resolveData(
    await rootModule.loader?.({
      request,
      params: {},
      signal: request.signal,
    }),
  );
  let redirectResponse: Response | undefined;
  const prepared = prepareRoutes(
    routes.map((route) => ({
      ...route,
      ErrorBoundary: route.ErrorBoundary ?? rootModule.ErrorBoundary,
    })),
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
  let router = await loadRouter(prepared, request);

  if (redirectResponse) {
    router.dispose();

    return redirectResponse;
  }

  if (actionResponse) {
    const hydrationData = {
      ...router.getSnapshot(),
      actionData: actionData instanceof Error ? undefined : actionData,
      ...(actionData instanceof Error && { error: actionData }),
    };
    router.dispose();
    router = createDataRouter(router.routes, { hydrationData });
  }

  const snapshot = router.getSnapshot();
  const html = await renderToStringAsync(
    <RouterApplication
      router={router}
      routes={routes}
      root={root}
      rootModule={rootModule}
      entry={entry}
      document
    />,
  );
  router.dispose();
  const headers = new Headers(actionResponse?.headers);
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(`<!doctype html>${html}`, {
    status: snapshot.error
      ? Number("status" in snapshot.error ? snapshot.error.status : 500)
      : (actionResponse?.status ?? 200),
    headers,
  });
}

export async function dispatchRoute(
  request: Request,
  routes: AppRoute[],
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

  const value = await Promise.resolve()
    .then(() =>
      handler({ request, params: match.params, signal: request.signal }),
    )
    .then(
      (result) => result,
      (error: unknown) => error,
    );

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
