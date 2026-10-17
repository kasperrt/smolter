/**
 * React components and typed data hooks. Import from @kasperrt/smolter/react.
 * @module
 */

import type { Route as RouteDefinition, RouteModule } from "@smolter/core";
import { useRouter, useSnapshot } from "./context.ts";

import {
  type ComponentType,
  createElement,
  type ReactNode,
  useMemo,
} from "./runtime.ts";

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
export function Routes({ fallback }: RoutesProps): ReactNode {
  const router = useRouter();
  const state = useSnapshot();
  const module = router.routes.find((route) => route.path === state.path) as
    | RouteDefinition<ViewModule>
    | undefined;
  const component =
    module?.[
      state.error
        ? "ErrorBoundary"
        : state.state === "loading" && !state.loaded
          ? "HydrateFallback"
          : "default"
    ];

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
