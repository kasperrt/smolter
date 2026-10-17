import type { ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ServerIncomingMessage } from "./handler.ts";

export async function webRequest(
  incoming: ServerIncomingMessage,
  outgoing: ServerResponse,
  target?: string,
): Promise<Request> {
  const origin = `${incoming.protocol ?? "http"}://${incoming.headers.host}`;
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }

  const controller = new AbortController();
  outgoing.once("close", () => controller.abort());
  const chunks: Uint8Array[] = [];

  for await (const chunk of incoming) chunks.push(chunk);

  return new Request(
    new URL(target ?? incoming.originalUrl ?? incoming.url ?? "/", origin),
    {
      method: incoming.method,
      headers,
      signal: controller.signal,
      ...(incoming.method !== "GET" &&
        incoming.method !== "HEAD" && {
          body: new Uint8Array(Buffer.concat(chunks)),
        }),
    },
  );
}

interface StreamingResponse extends ServerResponse {
  flush?: () => void;
}

export async function send(response: Response, outgoing: StreamingResponse) {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") outgoing.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();

  if (cookies.length)
    outgoing.setHeader(
      "set-cookie",
      cookies.map((cookie) =>
        process.env.NODE_ENV === "production"
          ? cookie
          : cookie.replace(/; Secure/gi, ""),
      ),
    );

  if (!response.body) {
    outgoing.end();
    return;
  }

  await pipeline(
    Readable.fromWeb(
      response.body as import("node:stream/web").ReadableStream<Uint8Array>,
    ),
    new Transform({
      transform(chunk, _encoding, done) {
        done(null, chunk);
        outgoing.flush?.();
      },
    }),
    outgoing,
  );
}
