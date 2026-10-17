/**
 * Preact routing components, typed data hooks and application integration.
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
export type { Submission, SubmissionOptions } from "@smolter/core/submission";
export { readSubmission } from "@smolter/core/submission";
export { Await } from "./await.tsx";
export {
  RouterProvider,
  type RouterProviderProps,
  useRouter,
} from "./context.ts";
export * from "./fetcher.ts";
export * from "./form.ts";
export * from "./hooks.ts";
export type { NavigateOptions } from "./navigation.tsx";
export * from "./navigation.tsx";
export {
  useMatches,
  useNavigation,
  useOutletContext,
  useRootData,
  useRouteError,
  useRouteLoaderData,
  useSubmit,
} from "./route-hooks.tsx";
export * from "./route-types.ts";
export { Outlet, type OutletProps, RouterApplication } from "./router.tsx";
export * from "./routes.ts";
