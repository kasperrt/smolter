/**
 * React components and typed data hooks. Import from smolter/react.
 * @module
 */

import type { Route as RouteDefinition, RouteModule } from "@smolter/core";
import { useRouter, useSnapshot } from "./context.ts";
import type { ComponentType, ReactNode } from "./runtime.ts";
import { createElement, useMemo } from "./runtime.ts";

/** Renderable route module with optional loading and error components. */
export interface ViewModule extends RouteModule {
  default?: ComponentType;
  HydrateFallback?: ComponentType;
  ErrorBoundary?: ComponentType<ErrorProps>;
}

/** Normalized route error supplied to an ErrorBoundary component. */
export interface ErrorProps {
  error: Error;
}

/** Fallback content used when no matching component can be rendered. */
export interface RoutesProps {
  fallback?: ReactNode;
}
/** Renders the first matching registered module. */
export function Routes({ fallback = null }: RoutesProps): ReactNode {
  const router = useRouter();
  const state = useSnapshot((snapshot) => snapshot);
  const module = router.routes.find((route) => route.path === state.path) as
    | RouteDefinition<ViewModule>
    | undefined;
  const component = state.error
    ? module?.ErrorBoundary
    : state.state === "loading" && state.data === undefined
      ? module?.HydrateFallback
      : module?.default;

  const element = useMemo(
    () =>
      component &&
      createElement(component as ComponentType<ErrorProps>, {
        error: state.error!,
      }),
    [component, state.error],
  );

  return element ?? state.error?.message ?? fallback;
}
