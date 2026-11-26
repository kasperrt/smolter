import { once } from "node:events";
import {
  createServer,
  request as httpRequest,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { type AddressInfo, Socket } from "node:net";
import { expect, it, vi } from "vitest";
import { createRequestHandler } from "../src/handler.ts";
import { send, webRequest } from "../src/http.ts";

it("rejects malformed or path-bearing Host headers before dispatching routes", async (context) => {
  const seen: string[] = [];
  const handler = createRequestHandler({
    entry: "/entry.js",
    build: {
      default: (request) => {
        seen.push(request.url);
        return new Response("ok");
      },
      handleDataRequest: (request) => {
        seen.push(request.url);
        return Response.json({ ok: true });
      },
    },
  });
  const server = createServer((incoming, outgoing) => {
    void handler(incoming, outgoing, () => {
      outgoing.writeHead(500).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  for (const host of [
    "app.example/admin",
    "evil@app.example",
    "app.example?x=1",
    "app.example#frag",
    "[::1",
    "app.example%2eevil.com",
    "0x7f000001",
    "127.1",
    "2130706433",
    "",
  ]) {
    const response = await new Promise<{
      status: number;
      connection?: string;
    }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/public",
          headers: host ? { Host: host } : {},
        },
        (res) => {
          res.resume();
          res.once("end", () =>
            resolve({
              status: res.statusCode!,
              connection: res.headers.connection,
            }),
          );
        },
      );
      if (!host) req.removeHeader("host");
      req.once("error", reject);
      req.end();
    });
    expect(response.status, host || "<missing>").toBe(400);
    expect(response.connection, host || "<missing>").toBe("close");
  }
  expect(seen).toEqual([]);
});

it("rejects non-origin-form request targets with 400 and Connection: close", async (context) => {
  const action = vi.fn(() => new Response("ok"));
  const handler = createRequestHandler({
    entry: "/entry.js",
    maxBodySize: 8,
    build: { default: action, handleDataRequest: action },
  });
  const server = createServer((incoming, outgoing) => {
    void handler(incoming, outgoing, () => {
      outgoing.writeHead(500).end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  for (const path of [
    "*",
    "http://app.example/admin",
    "//evil.example/assets",
    "/\\evil.example",
  ]) {
    const result = await new Promise<{ status: number; connection?: string }>(
      (resolve, reject) => {
        const req = httpRequest(
          { hostname: "127.0.0.1", port, method: "OPTIONS", path },
          (res) => {
            res.resume();
            res.once("end", () =>
              resolve({
                status: res.statusCode!,
                connection: res.headers.connection,
              }),
            );
          },
        );
        req.once("error", reject);
        req.end();
      },
    );
    expect(result.status, path).toBe(400);
    expect(result.connection, path).toBe("close");
  }
  expect(action).not.toHaveBeenCalled();
});

it("rejects synthetic webRequest calls with invalid protocol/origin or non-origin-form target", async () => {
  const make = (host: string, url: string, protocol?: string) => {
    const incoming = new IncomingMessage(new Socket()) as IncomingMessage & {
      protocol?: string;
    };
    incoming.headers.host = host;
    incoming.url = url;
    incoming.protocol = protocol;
    incoming.method = "GET";
    incoming.push(null);
    return { incoming, outgoing: new ServerResponse(incoming) };
  };
  for (const [host, url, protocol] of [
    ["example.com", "http://example.com/a", "http"],
    ["example.com", "/ok", "javascript"],
    ["example.com", "/ok", "http:x//y"],
    ["example.com", "/ok", "ftp"],
    ["example.com", "/ok", "ws"],
    ["app.example%2eevil.com", "/ok", "https"],
    ["0x7f000001", "/ok", "http"],
    ["example.com", "/folder/..//account", "http"],
    ["example.com", "//evil.example", "http"],
    ["example.com", "/\\evil.example", "http"],
  ] as const) {
    const { incoming, outgoing } = make(host, url, protocol);
    await expect(webRequest(incoming, outgoing)).rejects.toMatchObject({
      status: 400,
    });
    incoming.destroy();
  }
});

it("accepts a canonical host, an explicit default port, and a backslash in the query", async () => {
  const incoming = new IncomingMessage(new Socket()) as IncomingMessage & {
    protocol?: string;
  };
  incoming.headers.host = "app.example:443";
  incoming.url = "/search?q=\\";
  incoming.protocol = "https";
  incoming.method = "GET";
  incoming.push(null);
  const request = await webRequest(incoming, new ServerResponse(incoming));
  expect(request.url).toBe("https://app.example/search?q=\\");
  incoming.destroy();
});

it("does not forward a lying content length or transfer encoding", async (context) => {
  const server = createServer((_incoming, outgoing) => {
    void send(
      new Response("HELLO", {
        headers: {
          "Content-Length": "1",
          "Transfer-Encoding": "chunked",
          Connection: "close",
          "X-App": "yes",
        },
      }),
      outgoing,
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const length = response.headers.get("content-length");
  expect(response.headers.get("x-app")).toBe("yes");
  expect(response.headers.get("connection")).toBe("close");
  expect(length === null || length === "5").toBe(true);
  expect(length !== null && response.headers.has("transfer-encoding")).toBe(
    false,
  );
  expect(await response.text()).toBe("HELLO");
});

it("preserves prior middleware Set-Cookie headers and neutralizes CDN headers for no-store variants", async (context) => {
  for (const prior of ["a=1; Path=/", ["a=1; Path=/", "b=2; Path=/"]]) {
    const server = createServer((incoming, outgoing) => {
      outgoing.setHeader("Set-Cookie", prior);
      outgoing.setHeader("Cache-Control", "private, no-store, max-age=0");
      outgoing.setHeader("CDN-Cache-Control", "public, max-age=3600");
      void send(
        new Response("ok", {
          headers: { "Set-Cookie": "c=3; HttpOnly; Path=/" },
        }),
        outgoing,
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    context.onTestFinished(() => {
      server.closeAllConnections();
      server.close();
    });
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.headers.getSetCookie()).toEqual([
      ...(Array.isArray(prior) ? prior : [prior]),
      "c=3; HttpOnly; Path=/",
    ]);
    expect(response.headers.get("cdn-cache-control")).toBe("private, no-store");
    await response.text();
  }
});
