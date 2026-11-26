import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

const MAX_SESSIONS = 256;

export function sessions(): Plugin {
  const issued = new Set<string>();
  return {
    name: "example-sessions",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const cookie = request.headers.cookie ?? "";
        const existing = cookie.match(/(?:^|; )smolter-session=([\w-]+)/)?.[1];
        if (!existing || !issued.has(existing)) {
          const id = randomUUID();
          if (issued.size >= MAX_SESSIONS)
            issued.delete(issued.values().next().value!);
          issued.add(id);
          response.setHeader(
            "Set-Cookie",
            `smolter-session=${id}; HttpOnly; SameSite=Lax; Path=/`,
          );
          const others = cookie
            .split(/;\s*/)
            .filter((part) => part && !part.startsWith("smolter-session="));
          request.headers.cookie = [...others, `smolter-session=${id}`].join(
            "; ",
          );
        }
        next();
      });
    },
  };
}
