/**
 * Request-scoped server rendering and HTTP data dispatch.
 * @module
 */

import {
  createRouter,
  matchRoutes,
  type Route,
  type Router,
  type RouterOptions,
  type Snapshot,
  safeWrapAsync,
} from "@smolter/core";
/** Create one router per server request, await this, then render the provider. */
export async function loadRouter(
  routes: readonly Route[],
  input: string | Request,
): Promise<Router> {
  const url = typeof input === "string" ? input : input.url;
  const options: RouterOptions = {
    url,
    server: true,
    ...(typeof input !== "string" && { request: input }),
  };
  const router = createRouter(routes, options);

  await router.navigate(url);

  const snapshot = router.getSnapshot();

  if (
    !snapshot.error &&
    snapshot.data === undefined &&
    routes.some((route) => route.path === snapshot.path && route.clientLoader)
  ) {
    return createRouter(routes, {
      ...options,
      hydrationData: { ...snapshot, state: "loading" },
    });
  }

  return router;
}
/** Safe inside a script element. Data must be JSON serializable; errors are omitted. */
export function serialize(snapshot: Snapshot): string {
  return JSON.stringify({ ...snapshot, error: undefined })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Dispatch an HTTP data request to a registered server loader or action. */
export async function handleRequest(
  routes: readonly Route[],
  request: Request,
): Promise<Response> {
  const match = matchRoutes(routes, new URL(request.url).pathname);
  const reading = request.method === "GET";

  if (!match) return Response.json({ error: "No route" }, { status: 404 });

  if (!reading && !["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return Response.json({ error: "Method not allowed" }, { status: 405 });

  const handler = reading ? match.route.loader : match.route.action;

  if (!handler)
    return Response.json(
      { error: `No ${reading ? "loader" : "action"}` },
      { status: 405 },
    );

  const result = await safeWrapAsync(() =>
    handler({ request, params: match.params, signal: request.signal }),
  );
  const error = result.error ?? (result.data instanceof Error && result.data);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (result.data instanceof Response) {
    const location = result.data.headers.get("Location");

    if (location)
      return new Response(null, {
        headers: { "X-Smolter-Redirect": location },
      });

    return result.data;
  }

  return Response.json(result.data ?? null, {
    headers: { "Cache-Control": "no-store" },
  });
}
