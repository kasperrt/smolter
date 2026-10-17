/**
 * React routing components, typed data hooks and forms.
 *
 * @module
 */
export type * from "@smolter/core";
export {
  createDataRouter,
  createRouter,
  defineRoute,
} from "@smolter/core";
export {
  RouterProvider,
  type RouterProviderProps,
  useRouter,
} from "./context.ts";
export * from "./fetcher.ts";
export * from "./form.ts";
export * from "./hooks.ts";
export * from "./link.ts";
export {
  Outlet,
  type OutletProps,
  useMatches,
  useOutletContext,
} from "./outlet.ts";
export * from "./routes.ts";
