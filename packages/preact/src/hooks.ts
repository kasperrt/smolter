/**
 * Preact components and typed data hooks. Import from @kasperrt/smolter/preact.
 * @module
 */

import type {
  AnyDataFunction,
  Route,
  RouteModule,
  Router,
  Snapshot,
} from "@smolter/core";
import { useRouter, useSnapshot } from "./context.ts";
import type { RouteData } from "./route-types.ts";

/** A route module or loader function used for data inference. */
export type LoaderSource = RouteModule | AnyDataFunction;

/** Infer server and client loader data from a route module or function. */
export type LoaderData<T> = T extends AnyDataFunction
  ? RouteData<T>
  : T extends RouteModule
    ? RouteData<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
    : RouteData<T>;

/** Infer server and client action data from a route module or function. */
export type ActionData<T> = T extends AnyDataFunction
  ? RouteData<T>
  : T extends RouteModule
    ? RouteData<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
    : RouteData<T>;
/** Pass a route for inference, or use useLoaderData<typeof loader>() in its module. */
export function useLoaderData<T = RouteModule>(
  route?: T & LoaderSource,
): LoaderData<T> {
  return useSnapshot(
    "data",
    (route as Route | undefined)?.path,
  ) as LoaderData<T>;
}

/** Read the last page action result, optionally inferring its type from a route. */
export function useActionData<T = RouteModule>(
  route?: T & LoaderSource,
): ActionData<T> | undefined {
  return useSnapshot("actionData", (route as Route | undefined)?.path) as
    | ActionData<T>
    | undefined;
}

/** Read path parameters for the active route. */
export function useParams<
  T extends Snapshot["params"] = Snapshot["params"],
>(): T {
  return useSnapshot("params") as T;
}

/** Read the current path, search, and hash together with the navigate function. */
export function useLocation(): readonly [string, Router["navigate"]] {
  const router = useRouter();
  const url = useSnapshot("url");
  return [url.replace(/^\w+:\/\/[^/]+/, ""), router.navigate];
}

/** Get the function that revalidates the current loader subject to shouldRevalidate. */
export function useRevalidator(): Router["revalidate"] {
  return useRouter<Router>().revalidate;
}
