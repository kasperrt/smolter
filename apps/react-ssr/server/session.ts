import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

const MAX_SESSIONS = 256;

export function sessions(namespace: string): Plugin {
  const name = `${namespace}-session`;
  const pattern = new RegExp(`(?:^|; )${name}=([\\w-]+)`);
  const issued = new Set<string>();
  return {
    name: "example-sessions",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const cookie = request.headers.cookie ?? "";
        const existing = cookie.match(pattern)?.[1];
        if (!existing || !issued.has(existing)) {
          const id = randomUUID();
          if (issued.size >= MAX_SESSIONS)
            issued.delete(issued.values().next().value!);
          issued.add(id);
          response.setHeader(
            "Set-Cookie",
            `${name}=${id}; HttpOnly; SameSite=Lax; Path=/`,
          );
          const others = cookie
            .split(/;\s*/)
            .filter((part) => part && !part.startsWith(`${name}=`));
          request.headers.cookie = [...others, `${name}=${id}`].join("; ");
        }
        next();
      });
    },
  };
}
