import { randomUUID } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import { createRequestHandler } from "@kasperrt/smolter/utils/http";
import { safeWrapAsync } from "@smolter/core";
import type * as ServerBuild from "../src/server.ts";

interface Asset {
  body: Buffer;
  br?: Buffer;
  gzip?: Buffer;
  type: string;
}

// The compiled SSR build exists only after `vite build --ssr`; type it from its source entry.
const serverBuild = new URL("../dist/server/server.js", import.meta.url).href;
const { data, namespace, render }: typeof ServerBuild = await import(
  serverBuild
);

const root = await realpath(resolve(import.meta.dirname, "../dist"));
const template = await readFile(resolve(root, "index.html"), "utf8");
const types: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
// Hashed build assets never change at a URL, so browsers may keep them.
const immutable = "public, max-age=31536000, immutable";
const compressible = new Set([".js", ".css", ".svg", ".json"]);
const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);
// Cache all build assets in memory and precompress text assets at startup.
const assets = new Map<string, Asset>();
const listing = await safeWrapAsync(() =>
  readdir(resolve(root, "assets"), { withFileTypes: true }),
);
for (const entry of listing.data ?? []) {
  if (!entry.isFile() || entry.name.startsWith(".")) continue;
  const file = resolve(root, "assets", entry.name);
  const body = await readFile(file);
  const ext = extname(entry.name);
  const type = types[ext] ?? "application/octet-stream";
  if (!compressible.has(ext)) {
    assets.set(file, { body, type });
    continue;
  }
  const [br, gz] = await Promise.all([
    brotli(body, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    }),
    gzipped(body, { level: constants.Z_BEST_COMPRESSION }),
  ]);
  assets.set(file, { body, br, gzip: gz, type });
}
// Inline the small shared stylesheet into SSR HTML to eliminate a render-blocking RTT.
const styleMatch = template.match(
  /<link\s+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/,
);
const styleAsset = styleMatch && assets.get(resolve(root, `.${styleMatch[1]}`));
const documentTemplate = styleAsset
  ? template.replace(
      styleMatch[0],
      () => `<style>${styleAsset.body.toString("utf8")}</style>`,
    )
  : template;

function acceptedEncoding(header = "") {
  const weights = new Map(
    header.split(",").map((part) => {
      const [name, ...params] = part.trim().toLowerCase().split(";");
      const weight = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      return [name, weight ? Number(weight.slice(2)) : 1];
    }),
  );
  return (["br", "gzip"] as const).find((name) => (weights.get(name) ?? 0) > 0);
}

const session = `${namespace}-session`;
const sessionPattern = new RegExp(`(?:^|; )${session}=([\\w-]+)`);
const application = createRequestHandler({
  namespace,
  entry: "",
  build: {
    default: async (request) => {
      const html = await render(request, documentTemplate);
      const body = Buffer.from(html);
      const encoding =
        body.length >= 1024
          ? acceptedEncoding(request.headers.get("accept-encoding") ?? "")
          : undefined;
      const payload =
        encoding === "br"
          ? await brotli(body, {
              params: {
                [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
                [constants.BROTLI_PARAM_QUALITY]: 4,
                [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
              },
            })
          : encoding === "gzip"
            ? await gzipped(body, { level: 4 })
            : body;
      return new Response(payload, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          Vary: "Accept-Encoding",
          ...(encoding && { "Content-Encoding": encoding }),
        },
      });
    },
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
        const file = resolve(root, `.${path}`);
        if (
          !file.startsWith(`${root}/assets/`) ||
          file
            .slice(root.length + 1)
            .split("/")
            .some((part) => part.startsWith("."))
        )
          return;
        return assets.get(file);
      });
      if (!asset.data) {
        outgoing.writeHead(404).end();
        return;
      }
      const hasEncoded = Boolean(asset.data.br);
      const encoding =
        hasEncoded && acceptedEncoding(incoming.headers["accept-encoding"]);
      outgoing.setHeader("Content-Type", asset.data.type);
      outgoing.setHeader("Cache-Control", immutable);
      if (hasEncoded) outgoing.setHeader("Vary", "Accept-Encoding");
      if (encoding) outgoing.setHeader("Content-Encoding", encoding);
      outgoing.end(encoding ? asset.data[encoding] : asset.data.body);
      return;
    }
    const cookieHeader = incoming.headers.cookie ?? "";
    const existing = cookieHeader.match(sessionPattern)?.[1];
    if (!existing || !issuedSessions.has(existing)) {
      const id = randomUUID();
      if (issuedSessions.size >= MAX_SESSIONS)
        issuedSessions.delete(issuedSessions.values().next().value);
      issuedSessions.add(id);
      const others = cookieHeader
        .split(/;\s*/)
        .filter((part) => part && !part.startsWith(`${session}=`));
      incoming.headers.cookie = [...others, `${session}=${id}`].join("; ");
      outgoing.setHeader(
        "Set-Cookie",
        `${session}=${id}; HttpOnly; SameSite=Lax; Path=/`,
      );
    }
    await application(incoming, outgoing, () => {
      outgoing.writeHead(500).end("Request failed");
    });
  };
  const { error } = await safeWrapAsync(handle);
  if (error) outgoing.writeHead(500).end("Request failed");
}).listen(Number(process.env.PORT ?? 3000), "127.0.0.1");
