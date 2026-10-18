import type { IncomingMessage, ServerResponse } from "node:http";
import { safeWrapAsync } from "@smolter/core";
import { dataTarget } from "@smolter/core/transport";
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
}: RequestHandlerOptions): (
  incoming: ServerIncomingMessage,
  outgoing: ServerResponse,
  next: NextHandler,
) => Promise<void> {
  return (
    incoming: ServerIncomingMessage,
    outgoing: ServerResponse,
    next: NextHandler,
  ): Promise<void> => {
    const handle = async () => {
      const url = new URL(
        `http://local${incoming.originalUrl ?? incoming.url ?? "/"}`,
      );
      const target = dataTarget(url, dataEndpoint);
      const dataRequest = target !== undefined;
      if (dataRequest) outgoing.setHeader("Cache-Control", "private, no-store");
      if (target instanceof Error) {
        await send(new Response(target.message, { status: 400 }), outgoing);
        return;
      }

      const request = await webRequest(incoming, outgoing, target ?? undefined);
      const response = dataRequest
        ? await build.handleDataRequest(request)
        : await build.default(request, entry);

      await send(dataRequest ? privateResponse(response) : response, outgoing);
    };

    return safeWrapAsync(handle).then(({ error }) => {
      if (error) next(error);
    });
  };
}
