import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const maxSessions = 256;

export function createSessionHandler(namespace: string) {
  const name = `${namespace}-session`;
  const issued = new Set<string>();
  return (request: IncomingMessage, response: ServerResponse) => {
    const cookies = (request.headers.cookie ?? "")
      .split(/;\s*/)
      .filter(Boolean);
    const prefix = `${name}=`;
    const matching = cookies.filter((cookie) => cookie.startsWith(prefix));
    if (matching.length === 1 && issued.has(matching[0].slice(prefix.length)))
      return;
    const id = randomUUID();
    if (issued.size >= maxSessions)
      issued.delete(issued.values().next().value!);
    issued.add(id);
    const session = `${name}=${id}`;
    response.appendHeader(
      "Set-Cookie",
      `${session}; HttpOnly; SameSite=Lax; Path=/`,
    );
    request.headers.cookie = [
      ...cookies.filter((cookie) => !cookie.startsWith(prefix)),
      session,
    ].join("; ");
  };
}

export function sessions(namespace: string): Plugin {
  const ensureSession = createSessionHandler(namespace);
  return {
    name: "example-sessions",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        ensureSession(request, response);
        next();
      });
    },
  };
}
