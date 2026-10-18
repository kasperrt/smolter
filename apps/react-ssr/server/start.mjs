import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { safeWrapAsync } from "@smolter/core";
import { data, render } from "../dist/server/server.js";

const root = resolve(import.meta.dirname, "../dist");
const template = await readFile(resolve(root, "index.html"), "utf8");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};

const application = createRequestHandler({
  entry: "",
  build: {
    default: async (request) =>
      new Response(await render(request, template), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    handleDataRequest: data,
  },
});

createServer(async (incoming, outgoing) => {
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
    await application(incoming, outgoing, () => {
      outgoing.writeHead(500).end("Request failed");
    });
  };
  const { error } = await safeWrapAsync(handle);
  if (error) outgoing.writeHead(500).end("Request failed");
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
