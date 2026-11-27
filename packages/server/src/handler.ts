import type { IncomingMessage, ServerResponse } from "node:http";
import { safeWrapAsync } from "@smolter/core";
import {
  dataSuffix,
  discoverySuffix,
  validNamespace,
} from "@smolter/core/namespace";
import { dataTarget, requestURL } from "@smolter/core/transport";
import {
  createRouteDiscovery,
  discoveryTarget,
  type RouteDiscoveryOptions,
} from "./discovery.ts";
import { send, webRequest } from "./http.ts";
import { privateResponse } from "./private-response.ts";

/** Server module produced by an application's SSR entrypoint. */
export interface ServerBuild {
  default: (request: Request, entry: string) => Response | Promise<Response>;
  handleDataRequest: (request: Request) => Response | Promise<Response>;
}

/** SSR build, browser entry URL and application-scoped data endpoint for Node or Express. */
export interface RequestHandlerOptions {
  build: ServerBuild;
  /** Browser entry URL resolved from Vite's production manifest. */
  entry: string;
  /** Must match the browser and Vite transport endpoint. */
  dataEndpoint?: string;
  /** Maximum request-body bytes, including multipart overhead. Defaults to 1 MiB. */
  maxBodySize?: number;
  /** Must match the Vite namespace when this handler is not bundled by Vite. */
  namespace?: string;
  /** Serve authorized protected routes from the private discovery manifest. */
  routeDiscovery?: RouteDiscoveryOptions;
}

/** Node request with optional Express protocol and original URL information. */
export interface ServerIncomingMessage extends IncomingMessage {
  /** Express supplies this using the application's trust proxy policy. */
  protocol?: string;
  originalUrl?: string;
}

/** Express-compatible callback for forwarding middleware errors. */
export type NextHandler = (error?: unknown) => void;

/** Node/Express middleware; mount after metrics, tracing and static assets. */
export function createRequestHandler({
  build,
  entry,
  dataEndpoint,
  maxBodySize,
  namespace,
  routeDiscovery,
}: RequestHandlerOptions): (
  incoming: ServerIncomingMessage,
  outgoing: ServerResponse,
  next: NextHandler,
) => Promise<void> {
  const name = namespace === undefined ? undefined : validNamespace(namespace);
  const suffix = dataSuffix(name);
  const routeSuffix = discoverySuffix(name);
  const discover = routeDiscovery && createRouteDiscovery(routeDiscovery);
  return async (
    incoming: ServerIncomingMessage,
    outgoing: ServerResponse,
    next: NextHandler,
  ): Promise<void> => {
    const handle = async () => {
      const url = requestURL(incoming.originalUrl ?? incoming.url);
      if (url instanceof Error) {
        await send(
          new Response(url.message, {
            status: 400,
            headers: { Connection: "close" },
          }),
          outgoing,
        );
        return;
      }
      // requestURL has already rejected protocol-relative and malformed targets.
      const discoveryPath = discover && discoveryTarget(url, routeSuffix);
      if (discover && typeof discoveryPath === "string") {
        const request = await webRequest(
          incoming,
          outgoing,
          discoveryPath,
          maxBodySize,
        );
        await send(await discover(request, discoveryPath), outgoing);
        return;
      }
      const target = dataTarget(url, dataEndpoint, suffix);
      const dataRequest = target !== undefined;
      if (dataRequest) outgoing.setHeader("Cache-Control", "private, no-store");
      if (target instanceof Error) {
        await send(new Response(target.message, { status: 400 }), outgoing);
        return;
      }
      const request = await webRequest(
        incoming,
        outgoing,
        target ?? undefined,
        maxBodySize,
      );
      const response = dataRequest
        ? await build.handleDataRequest(request)
        : await build.default(request, entry);
      await send(dataRequest ? privateResponse(response) : response, outgoing);
    };
    const { error } = await safeWrapAsync(handle);
    if (error?.cause instanceof Response) return send(error.cause, outgoing);
    if (error) next(error);
  };
}
