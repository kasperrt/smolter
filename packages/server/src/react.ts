/**
 * React SSR rendering and route data dispatch.
 * @module
 */
import type { AppRoute, RootModule } from "@smolter/react/route-types";
import { RouterApplication } from "@smolter/react/router";
import { createElement } from "react";
import * as ReactDOMServer from "react-dom/server";
import {
  type RenderApplicationOptions,
  renderDocument,
} from "./render-application.ts";

export * from "./index.ts";
export type { RenderApplicationOptions } from "./render-application.ts";

/** Render a React document with root and route data using React's streaming renderer. */
export async function renderApplication(
  request: Request,
  routes: AppRoute[],
  rootModule: RootModule,
  entry: string,
  options: RenderApplicationOptions = {},
): Promise<Response> {
  const { renderToReadableStream } = ReactDOMServer;
  if (!renderToReadableStream)
    throw new Error("renderApplication requires React DOM 19 or newer.");
  return renderDocument(request, routes, rootModule, entry, options, (props) =>
    renderToReadableStream(
      createElement(RouterApplication, { ...props, rootModule }),
      { nonce: options.nonce, signal: request.signal },
    ),
  );
}
