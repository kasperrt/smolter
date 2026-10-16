import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

export function sessions(): Plugin {
  return {
    name: "example-sessions",

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const cookie = request.headers.cookie ?? "";

        if (!/(?:^|; )smolter-session=/.test(cookie)) {
          const id = randomUUID();

          response.setHeader(
            "Set-Cookie",
            `smolter-session=${id}; HttpOnly; SameSite=Lax; Path=/`,
          );
          request.headers.cookie = `${cookie}${cookie ? "; " : ""}smolter-session=${id}`;
        }

        next();
      });
    },
  };
}
