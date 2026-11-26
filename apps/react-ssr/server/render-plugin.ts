import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { safeWrapAsync } from "@smolter/core";
import type { Plugin } from "vite";

export function serverRendering(namespace: string): Plugin {
  return {
    name: "example-ssr",
    configureServer(server) {
      return () => {
        server.middlewares.use(async (request, response, next) => {
          if (
            request.method !== "GET" ||
            new URL(request.url ?? "/", "http://local").pathname.endsWith(
              `.__${namespace}`,
            )
          )
            return next();
          const controller = new AbortController();
          response.once("close", () => controller.abort());
          const render = async () => {
            const entry = await server.ssrLoadModule("/src/server.ts");
            const template = await server.transformIndexHtml(
              request.url!,
              await readFile(resolve(server.config.root, "index.html"), "utf8"),
            );
            const host = request.headers.host;
            const rawTarget = request.url ?? "/";
            if (
              !host ||
              /[\s/?#@\\]/.test(host) ||
              !rawTarget.startsWith("/") ||
              !URL.canParse(`.${rawTarget}`, `http://${host}/`)
            ) {
              response
                .writeHead(400, { Connection: "close" })
                .end("Bad request");
              return;
            }
            const incoming = new Request(
              new URL(`.${rawTarget}`, `http://${host}/`),
              {
                headers: { cookie: request.headers.cookie ?? "" },
                signal: controller.signal,
              },
            );
            // This is our SSR entry accepting a Request, not Express template-name rendering.
            // nosemgrep: javascript.express.security.audit.res-render-injection.res-render-injection
            const html = await entry.render(incoming, template);
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.setHeader("Cache-Control", "private, no-store");
            response.end(html);
          };
          const { error } = await safeWrapAsync(render);
          if (error) next(error);
        });
      };
    },
  };
}
