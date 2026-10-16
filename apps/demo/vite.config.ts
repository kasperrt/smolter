import { resolve } from "node:path";
import { defineConfig } from "vite";
import { counterApi, ensureSession } from "./server/counter.ts";
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        preact: resolve(import.meta.dirname, "preact.html"),
      },
    },
  },
  plugins: [
    {
      name: "ssr-example",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/api/counter") {
            void counterApi(request, response).catch(next);
            return;
          }
          if (request.url !== "/ssr") {
            next();
            return;
          }
          void server
            .ssrLoadModule("/src/server.tsx")
            .then(async (module) => {
              ensureSession(request, response);
              const html = await module.render(
                new Request(`http://${request.headers.host}/ssr`, {
                  headers: { cookie: request.headers.cookie ?? "" },
                }),
              );
              response.setHeader("Content-Type", "text/html");
              response.end(await server.transformIndexHtml("/ssr", html));
            })
            .catch(next);
        });
      },
    },
  ],
});
