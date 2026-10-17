/** @jsxImportSource preact */
import type { AppRoute, RootModule } from "@smolter/preact/route-types";
import { RouterApplication } from "@smolter/preact/router";
import type { ComponentChildren } from "preact";
import { Suspense } from "preact/compat";
import { renderToReadableStream } from "preact-render-to-string/stream";
import {
  type RenderApplicationOptions,
  renderDocument,
} from "./render-application.ts";

export { dispatchRoute } from "./dispatch.ts";
export type { RenderApplicationOptions } from "./render-application.ts";

/** Render a Preact application response with root data and optional early deferred hydration. */
export function renderApplication(
  request: Request,
  routes: AppRoute[],
  rootModule: RootModule,
  entry: string,
  options: RenderApplicationOptions = {},
): Promise<Response> {
  return renderDocument(request, routes, rootModule, entry, options, (props) =>
    renderToReadableStream(
      <RouterApplication
        {...props}
        rootModule={rootModule}
        deferredBoundary={options.earlyHydration ? undefined : deferredBoundary}
      />,
      options,
    ),
  );
}
function deferredBoundary(
  children: ComponentChildren,
  fallback: ComponentChildren,
) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}
