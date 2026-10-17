/** Resource subscriptions independent of URL navigation. @module */
export type {
  ActionFunctionArgs as ResourceActionArgs,
  DataResult as ResourceResult,
  LoaderFunctionArgs as ResourceLoaderArgs,
  ShouldRevalidateFunctionArgs as ResourceRevalidationArgs,
} from "@smolter/core/resource-types";
export {
  createResourceRouter,
  ResourceRouter,
} from "@smolter/core/resources";
export type { ResourceRouteModule } from "./resources/components.tsx";
export {
  Form as ResourceForm,
  Route as Resource,
  RouterProvider as ResourceProvider,
  useActionData as useResourceActionData,
  useFetcher as useResourceFetcher,
  useLoaderData as useResourceData,
  useNavigation as useResourceNavigation,
  useRevalidator as useResourceRevalidator,
  useRouteLoaderData,
  useRouter as useResourceRouter,
  useSubmit as useResourceSubmit,
} from "./resources/components.tsx";
