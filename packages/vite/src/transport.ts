import { safeWrapAsync } from "@smolter/core";
import { dataTarget } from "@smolter/core/transport";
import { send, webRequest } from "@smolter/server/http";
import type { ViteDevServer } from "vite";

const guarded = new WeakSet<ViteDevServer["middlewares"]>();

// Connect parses the target before invoking middleware. Contain synchronous
// parser failures at its public entrypoint, including in middleware mode.
function guardRequests(server: ViteDevServer) {
  const middlewares = server.middlewares;
  if (guarded.has(middlewares)) return;
  guarded.add(middlewares);
  const handle = middlewares.handle;
  middlewares.handle = async (incoming, outgoing, next) => {
    const { error } = await safeWrapAsync(
      () => handle.call(middlewares, incoming, outgoing, next),
      true,
    );
    if (!error) return;
    const cause = error.cause;
    const malformed =
      cause instanceof TypeError &&
      !URL.canParse(incoming.url ?? "/", "http://local");
    if (!malformed && next) return next(cause ?? error);
    if (!malformed) server.config.logger.error(error.message);
    if (outgoing.destroyed || outgoing.writableEnded) return;
    if (outgoing.headersSent) return outgoing.destroy();
    outgoing.writeHead(malformed ? 400 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "close",
    });
    outgoing.end(malformed ? "Bad request" : "Request failed");
  };
}

export function configureTransport(
  server: ViteDevServer,
  publicId: string,
  framework: "react" | "preact" = "react",
  dataEndpoint: string | undefined = undefined,
  maxBodySize?: number,
): void {
  guardRequests(server);
  server.middlewares.use(async (incoming, outgoing, next) => {
    const dispatch = async () => {
      const target = dataTarget(
        new URL(`http://local${incoming.url ?? "/"}`),
        dataEndpoint,
      );
      if (target === undefined) return next();
      outgoing.setHeader("Cache-Control", "private, no-store");
      if (target instanceof Error) {
        outgoing.statusCode = 400;
        outgoing.end(target.message);
        return;
      }
      const request = await webRequest(incoming, outgoing, target, maxBodySize);
      const [{ default: routes }, { handleRequest }] = await Promise.all([
        server.ssrLoadModule(publicId),
        server.ssrLoadModule(`@kasperrt/smolter/${framework}/server`),
      ]);
      const response: Response = await handleRequest(routes, request);
      await send(response, outgoing);
    };
    const { error } = await safeWrapAsync(dispatch);
    if (error?.cause instanceof Response) await send(error.cause, outgoing);
    else if (error) next(error);
  });
}
