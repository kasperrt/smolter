import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export function serverRendering(): Plugin {
  return {
    name: "example-ssr",

    configureServer(server) {
      return () => {
        server.middlewares.use((request, response, next) => {
          if (request.method !== "GET" || request.url?.startsWith("/_smolter"))
            return next();

          const render = async () => {
            const entry = await server.ssrLoadModule("/src/server.ts");
            const template = await server.transformIndexHtml(
              request.url!,
              await readFile(resolve(server.config.root, "index.html"), "utf8"),
            );
            const incoming = new Request(
              `http://${request.headers.host}${request.url}`,
              {
                headers: { cookie: request.headers.cookie ?? "" },
              },
            );
            const html = await entry.render(incoming, template);

            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(html);
          };

          void render().catch(next);
        });
      };
    },
  };
}
