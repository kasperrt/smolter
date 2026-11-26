import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { safeWrapAsync } from "@smolter/core";
import { data, render } from "../dist/server/server.js";

const root = await realpath(resolve(import.meta.dirname, "../dist"));
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

const MAX_SESSIONS = 256;
const issuedSessions = new Set();

createServer(async (incoming, outgoing) => {
  const handle = async () => {
    const rawTarget = incoming.url ?? "/";
    if (
      !rawTarget.startsWith("/") ||
      rawTarget.startsWith("//") ||
      !URL.canParse(`http://local${rawTarget}`)
    ) {
      outgoing.writeHead(400, { Connection: "close" }).end("Bad request");
      return;
    }
    const url = new URL(`http://local${rawTarget}`);
    if (url.pathname.startsWith("/assets/")) {
      const asset = await safeWrapAsync(async () => {
        const path = decodeURIComponent(url.pathname);
        if (
          /[\\\u0000]/.test(path) ||
          path.split("/").some((part) => part.startsWith("."))
        )
          return;
        const file = await realpath(resolve(root, `.${path}`));
        if (
          !file.startsWith(`${root}/assets/`) ||
          file
            .slice(root.length + 1)
            .split("/")
            .some((part) => part.startsWith("."))
        )
          return;
        return { file, body: await readFile(file) };
      });
      if (!asset.data) {
        outgoing.writeHead(404).end();
        return;
      }
      outgoing.setHeader(
        "Content-Type",
        types[extname(asset.data.file)] ?? "application/octet-stream",
      );
      outgoing.end(asset.data.body);
      return;
    }
    const cookieHeader = incoming.headers.cookie ?? "";
    const existing = cookieHeader.match(
      /(?:^|; )smolter-session=([\w-]+)/,
    )?.[1];
    if (!existing || !issuedSessions.has(existing)) {
      const id = randomUUID();
      if (issuedSessions.size >= MAX_SESSIONS)
        issuedSessions.delete(issuedSessions.values().next().value);
      issuedSessions.add(id);
      const others = cookieHeader
        .split(/;\s*/)
        .filter((part) => part && !part.startsWith("smolter-session="));
      incoming.headers.cookie = [...others, `smolter-session=${id}`].join("; ");
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
