import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

interface Counter {
  count: number;
  reads: number;
}
const counters = new Map<string, Counter>();
export function ensureSession(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const existing = request.headers.cookie?.match(
    /(?:^|; )smolter-demo=([\w-]+)/,
  )?.[1];
  const id = existing ?? randomUUID();
  if (!existing)
    response.setHeader(
      "Set-Cookie",
      `smolter-demo=${id}; HttpOnly; SameSite=Strict; Path=/`,
    );
  request.headers.cookie = `smolter-demo=${id}`;
  return id;
}
/** Development-only API. Isolated by browser cookie; no external backend. */
export async function counterApi(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const id = ensureSession(request, response);
  const counter = counters.get(id) ?? { count: 0, reads: 0 };
  counters.set(id, counter);
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET") {
    counter.reads++;
    response.end(JSON.stringify(counter));
    return;
  }
  if (request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const reset = new URLSearchParams(body).get("intent") === "reset";
    counter.count = reset ? 0 : counter.count + 1;
    response.end(
      JSON.stringify({
        message: reset
          ? "Reset. GET /api/counter refreshed."
          : "Saved. GET /api/counter refreshed.",
      }),
    );
    return;
  }
  response.statusCode = 405;
  response.end(JSON.stringify({ error: "Method not allowed" }));
}
