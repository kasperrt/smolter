import { safeWrapAsync } from "@smolter/core";
import { dataTarget } from "@smolter/core/transport";
import { send, webRequest } from "@smolter/server/http";
import type { ViteDevServer } from "vite";

export function configureTransport(
  server: ViteDevServer,
  publicId: string,
  framework: "react" | "preact" = "react",
  dataEndpoint: string | undefined = undefined,
  maxBodySize?: number,
): void {
  server.middlewares.use(async (incoming, outgoing, next) => {
    const target = dataTarget(
      new URL(`http://local${incoming.url ?? "/"}`),
      dataEndpoint,
    );
    if (target === undefined) return next();
    outgoing.setHeader("Cache-Control", "private, no-store");
    const dispatch = async () => {
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
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      outgoing.end(new Uint8Array(await response.arrayBuffer()));
    };
    const { error } = await safeWrapAsync(dispatch);
    if (error?.cause instanceof Response) await send(error.cause, outgoing);
    else if (error) next(error);
  });
}
