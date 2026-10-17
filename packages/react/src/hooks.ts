/**
 * React components and typed data hooks. Import from @kasperrt/smolter/react.
 * @module
 */

import type {
  AnyDataFunction,
  DataOf,
  Route,
  RouteModule,
  Router,
  Snapshot,
} from "@smolter/core";

import { useRouter, useSnapshot } from "./context.ts";

/** A route module or loader function used for data inference. */
export type LoaderSource = RouteModule | AnyDataFunction;

/** Infer server and client loader data from a route module or function. */
export type LoaderData<T> = T extends AnyDataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<Extract<T["loader"] | T["clientLoader"], AnyDataFunction>>
    : unknown;

/** Infer server and client action data from a route module or function. */
export type ActionData<T> = T extends AnyDataFunction
  ? DataOf<T>
  : T extends RouteModule
    ? DataOf<Extract<T["action"] | T["clientAction"], AnyDataFunction>>
    : unknown;
/** Pass a route for inference, or use useLoaderData<typeof loader>() in its module. */
export function useLoaderData<T extends LoaderSource = RouteModule>(
  route?: T,
): LoaderData<T> | undefined {
  return useSnapshot("data", (route as Route | undefined)?.path) as
    | LoaderData<T>
    | undefined;
}

/** Read the last page action result, optionally inferring its type from a route. */
export function useActionData<T extends LoaderSource = RouteModule>(
  route?: T,
): ActionData<T> | undefined {
  return useSnapshot("actionData", (route as Route | undefined)?.path) as
    | ActionData<T>
    | undefined;
}

/** Read path parameters for the active route. */
export function useParams(): Snapshot["params"] {
  return useSnapshot("params");
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
