import {
  createRouter,
  type Route,
  type Router,
  type RouterOptions,
  type Snapshot,
} from "./core.ts";
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
