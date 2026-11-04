import type { ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { safeWrapAsync } from "@smolter/core";
import type { ServerIncomingMessage } from "./handler.ts";
import { requestPolicy } from "./request-policy.ts";

/** Convert a Node request with cancellation and an optional route target. Enforce mutation policy and a 1 MiB body limit; rejected requests throw a Response. */
export async function webRequest(
  incoming: ServerIncomingMessage,
  outgoing: ServerResponse,
  target?: string,
  maxBodySize = 1_048_576,
): Promise<Request> {
  if (!Number.isSafeInteger(maxBodySize) || maxBodySize < 0)
    throw new RangeError("maxBodySize must be a nonnegative safe integer");
  const origin = `${incoming.protocol ?? "http"}://${incoming.headers.host}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  // Origin-form paths can start with //; never interpret them as a URL authority.
  const url = new URL(
    `.${target ?? incoming.originalUrl ?? incoming.url ?? "/"}`,
    `${origin}/`,
  );
  const denied = requestPolicy({
    method: incoming.method ?? "GET",
    url: url.href,
    headers,
  });
  if (denied) {
    denied.headers.set("Connection", "close");
    throw denied;
  }
  const checkSize = (size: number) => {
    if (size > maxBodySize)
      throw new Response("Request body too large", {
        status: 413,
      });
  };
  checkSize(Number(headers.get("Content-Length")));
  const controller = new AbortController();
  outgoing.once("close", () => controller.abort());
  if (outgoing.destroyed || outgoing.writableEnded) controller.abort();
  const chunks: Uint8Array[] = [];
  let size = 0;
  // Keep the socket available long enough to send 413 after a chunk crosses the limit.
  for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
    size += chunk.byteLength;
    checkSize(size);
    chunks.push(chunk);
  }
  return new Request(url, {
    method: incoming.method,
    headers,
    signal: controller.signal,
    ...(incoming.method !== "GET" &&
      incoming.method !== "HEAD" && {
        body: new Uint8Array(Buffer.concat(chunks)),
      }),
  });
}

interface StreamingResponse extends ServerResponse {
  flush?: () => void;
}

/** Write a Web Response to Node with streaming backpressure and disconnect cancellation. */
export async function send(response: Response, outgoing: StreamingResponse) {
  if (outgoing.destroyed || outgoing.writableEnded) {
    await response.body?.cancel();
    return;
  }
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
  const source = Readable.fromWeb(
    response.body as import("node:stream/web").ReadableStream<Uint8Array>,
  );
  let disconnected = false;
  const close = () => {
    // pipeline also closes the destination after source/write failures.
    // Only a clean downstream disconnect owns cancellation here.
    disconnected =
      !outgoing.writableFinished && !source.errored && !outgoing.errored;
  };
  outgoing.once("close", close);
  const transfer = pipeline(
    source,
    new Transform({
      transform(chunk, _encoding, done) {
        done(null, chunk);
        outgoing.flush?.();
      },
    }),
    outgoing,
  );
  const { error } = await safeWrapAsync(() => transfer);
  outgoing.off("close", close);
  if (error && !disconnected)
    throw outgoing.errored ?? source.errored ?? error.cause ?? error;
}
