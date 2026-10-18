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
export type { ApplicationEnvironment } from "@smolter/core/environment";
export * from "@smolter/core/responses";
export {
  readSubmission,
  type Submission,
  type SubmissionOptions,
} from "@smolter/core/submission";
export {
  RouterProvider,
  type RouterProviderProps,
  useRouter,
} from "./context.ts";
export * from "./fetcher.ts";
export * from "./form.ts";
export * from "./hooks.ts";
export * from "./navigation.ts";
export {
  Outlet,
  type OutletProps,
  useMatches,
  useOutletContext,
} from "./outlet.ts";
export {
  useNavigation,
  useRootData,
  useRouteError,
  useRouteLoaderData,
  useSubmit,
} from "./route-hooks.ts";
export * from "./route-types.ts";
export { type ApplicationProps, RouterApplication } from "./router.ts";
export * from "./routes.ts";
