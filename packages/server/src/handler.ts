import type { IncomingMessage, ServerResponse } from "node:http";
import { send, webRequest } from "./http.ts";

/** Server module produced by an application's SSR entrypoint. */
export interface ServerBuild {
  default: (request: Request, entry: string) => Response | Promise<Response>;
  handleDataRequest: (request: Request) => Response | Promise<Response>;
}

export interface RequestHandlerOptions {
  build: ServerBuild;
  /** Browser entry URL resolved from Vite's production manifest. */
  entry: string;
}

export interface ServerIncomingMessage extends IncomingMessage {
  /** Express supplies this using the application's trust proxy policy. */
  protocol?: string;
  originalUrl?: string;
}

export type NextHandler = (error?: unknown) => void;

/** Node/Express middleware; mount after metrics, tracing and static assets. */
export function createRequestHandler({
  build,
  entry,
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
        incoming.originalUrl ?? incoming.url ?? "/",
        "http://local",
      );
      const dataRequest = url.pathname === "/_smolter";
      const target = dataRequest ? url.searchParams.get("url") : undefined;

      if (
        dataRequest &&
        (!target?.startsWith("/") ||
          new URL(target, "http://local").origin !== "http://local")
      ) {
        await send(
          new Response("Invalid route URL", { status: 400 }),
          outgoing,
        );

        return;
      }

      const request = await webRequest(incoming, outgoing, target ?? undefined);
      const response = dataRequest
        ? await build.handleDataRequest(request)
        : await build.default(request, entry);

      await send(response, outgoing);
    };

    return handle().catch(next);
  };
}
