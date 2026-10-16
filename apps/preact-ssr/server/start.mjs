import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { data, render } from "../dist/server/server.js";

const root = resolve(import.meta.dirname, "../dist");
const template = await readFile(resolve(root, "index.html"), "utf8");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};

createServer((incoming, outgoing) => {
  const controller = new AbortController();

  outgoing.once("close", () => controller.abort());

  const handle = async () => {
    const origin = `http://${incoming.headers.host}`;
    const url = new URL(incoming.url, origin);

    if (url.pathname.startsWith("/assets/")) {
      const file = resolve(root, `.${url.pathname}`);

      if (!file.startsWith(`${root}/assets/`)) {
        outgoing.writeHead(404).end();
        return;
      }

      outgoing.setHeader(
        "Content-Type",
        types[extname(file)] ?? "application/octet-stream",
      );
      outgoing.end(await readFile(file));
      return;
    }

    if (!/(?:^|; )smolter-session=/.test(incoming.headers.cookie ?? "")) {
      const id = randomUUID();

      incoming.headers.cookie = `smolter-session=${id}`;
      outgoing.setHeader(
        "Set-Cookie",
        `smolter-session=${id}; HttpOnly; SameSite=Lax; Path=/`,
      );
    }

    const headers = new Headers();

    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value)
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    if (url.pathname === "/_smolter") {
      const target = url.searchParams.get("url");

      if (!target?.startsWith("/") || target.startsWith("//")) {
        outgoing.writeHead(400).end();
        return;
      }

      const chunks = [];

      for await (const chunk of incoming) chunks.push(chunk);

      const request = new Request(new URL(target, origin), {
        signal: controller.signal,
        method: incoming.method,
        headers,
        ...(incoming.method !== "GET" && {
          body: new Uint8Array(Buffer.concat(chunks)),
        }),
      });
      const result = await data(request);

      outgoing.statusCode = result.status;
      result.headers.forEach((value, key) => outgoing.setHeader(key, value));
      outgoing.end(new Uint8Array(await result.arrayBuffer()));
      return;
    }

    outgoing.setHeader("Content-Type", "text/html; charset=utf-8");
    const request = new Request(url, { headers, signal: controller.signal });

    outgoing.end(await render(request, template));
  };

  void handle().catch(() => {
    outgoing.writeHead(500).end("Request failed");
  });
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
