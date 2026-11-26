import type { ServerResponse } from "node:http";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { safeWrapAsync } from "@smolter/core";
import type { ServerIncomingMessage } from "./handler.ts";
import { cacheHeader } from "./private-response.ts";
import { requestPolicy } from "./request-policy.ts";

const noStoreDirective = /(?:^|,)\s*no-store(?:\s*,|$)/i;
const framingHeader = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "host",
]);

function badRequest(): Response {
  return new Response("Bad request", {
    status: 400,
    headers: { Connection: "close" },
  });
}

function requestOrigin(incoming: ServerIncomingMessage): string {
  const host = incoming.headers.host;
  const protocol = incoming.protocol ?? "http";
  // Express copies X-Forwarded-Proto through unchanged. Only http and https
  // may become the request origin, and the header must already be that origin's host.
  if (
    (protocol !== "http" && protocol !== "https") ||
    typeof host !== "string" ||
    /[\s/?#@\\%]/.test(host) ||
    /[^\x21-\x7e]/.test(host) ||
    !URL.canParse(`${protocol}://${host}`)
  )
    throw badRequest();
  const parsed = new URL(`${protocol}://${host}`);
  const defaultPort = protocol === "https" ? "443" : "80";
  if (
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    (host !== parsed.host &&
      host !== parsed.hostname &&
      host !== `${parsed.hostname}:${defaultPort}`)
  )
    throw badRequest();
  return parsed.origin;
}

/** Convert a Node request with cancellation and an optional route target. Enforce mutation policy and a 1 MiB body limit; rejected requests throw a Response. */
export async function webRequest(
  incoming: ServerIncomingMessage,
  outgoing: ServerResponse,
  target?: string,
  maxBodySize = 1_048_576,
): Promise<Request> {
  if (!Number.isSafeInteger(maxBodySize) || maxBodySize < 0)
    throw new RangeError("maxBodySize must be a nonnegative safe integer");
  const origin = requestOrigin(incoming);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value)
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const rawTarget = (target ?? incoming.originalUrl ?? incoming.url) || "/";
  const rawPath = rawTarget.split(/[?#]/, 1)[0] ?? "";
  // A backslash or extra slash survives as a protocol-relative pathname.
  if (
    !rawTarget.startsWith("/") ||
    !rawPath.startsWith("/") ||
    rawPath.startsWith("//") ||
    rawPath.includes("\\") ||
    !URL.canParse(`.${rawTarget}`, `${origin}/`)
  )
    throw badRequest();
  const url = new URL(`.${rawTarget}`, `${origin}/`);
  if (url.origin !== origin || url.pathname.startsWith("//"))
    throw badRequest();
  const method = incoming.method ?? "GET";
  const denied = requestPolicy({
    method,
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
        headers: { Connection: "close" },
      });
  };
  checkSize(Number(headers.get("Content-Length")));
  const controller = new AbortController();
  outgoing.once("close", () => controller.abort());
  if (outgoing.destroyed || outgoing.writableEnded) controller.abort();
  const hasBody = method !== "GET" && method !== "HEAD";
  const chunks: Uint8Array[] = [];
  if (hasBody) {
    if (incoming.readableEncoding) throw badRequest();
    let size = 0;
    // Keep the socket available long enough to send 413 after a chunk crosses the limit.
    for await (const chunk of incoming.iterator({ destroyOnReturn: false })) {
      size += chunk.byteLength;
      checkSize(size);
      chunks.push(chunk);
    }
  }
  return new Request(url, {
    method: incoming.method,
    headers,
    signal: controller.signal,
    ...(hasBody && {
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
  const privateCache =
    noStoreDirective.test(String(outgoing.getHeader("Cache-Control") ?? "")) ||
    noStoreDirective.test(response.headers.get("Cache-Control") ?? "");
  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => {
    // Node frames the body. A copied length or transfer encoding can desynchronize it.
    if (name === "set-cookie" || framingHeader.has(name)) return;
    outgoing.setHeader(name, value);
  });
  if (/\bclose\b/i.test(response.headers.get("connection") ?? ""))
    outgoing.setHeader("connection", "close");
  if (privateCache) {
    for (const name of outgoing.getHeaderNames()) {
      if (cacheHeader.test(name)) outgoing.setHeader(name, "private, no-store");
    }
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) {
    const existing = outgoing.getHeader("set-cookie");
    const prior = Array.isArray(existing)
      ? existing.map(String)
      : existing !== undefined
        ? [String(existing)]
        : [];
    outgoing.setHeader("set-cookie", [...prior, ...cookies]);
  }
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
