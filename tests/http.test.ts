import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, onTestFinished, test, vi } from "vitest";
import { createRequestHandler } from "../packages/server/src/handler.ts";

test("hosts documents and route data under existing Node middleware", async () => {
  let requests = 0;
  const handler = createRequestHandler({
    entry: "/assets/client.js",
    build: {
      default: (request, entry) =>
        new Response(`${new URL(request.url).pathname}:${entry}`),
      handleDataRequest: async (request) =>
        new Response(
          `${request.method}:${new URL(request.url).pathname}:${await request.text()}`,
          { status: 201, headers: { "X-Action": "saved" } },
        ),
    },
  });
  const server = createServer((request, response) => {
    requests++;
    if (request.url === "/tasks/1") {
      response.end("Existing endpoint");
      return;
    }
    response.setHeader("X-Metrics-Middleware", "present");
    void handler(request, response, () => {
      response.statusCode = 500;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") return;
  const base = `http://127.0.0.1:${address.port}`;
  onTestFinished(() => {
    server.close();
  });
  {
    const document = await fetch(`${base}/tasks`);
    expect(await document.text()).toBe("/tasks:/assets/client.js");
    expect(document.headers.get("X-Metrics-Middleware")).toBe("present");
    expect(await (await fetch(`${base}/tasks/1`)).text()).toBe(
      "Existing endpoint",
    );
    const action = await fetch(`${base}/tasks/1.__smolter`, {
      method: "PATCH",
      body: "title=Updated",
    });
    expect(action.status).toBe(201);
    expect(action.headers.get("X-Action")).toBe("saved");
    expect(await action.text()).toBe("PATCH:/tasks/1:title=Updated");
    const invalid = await fetch(`${base}//evil.__smolter`);
    expect(invalid.status).toBe(400);
    expect(requests).toBe(4);
  }
});

test.each(["production", "development"])(
  "preserves separate response cookies in %s",
  async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const handler = createRequestHandler({
      entry: "/client.js",
      build: {
        default: () =>
          new Response("cookies", {
            headers: [
              ["Set-Cookie", "session=one; Secure; HttpOnly; SameSite=Lax"],
              ["Set-Cookie", "theme=dark; Secure; Path=/"],
            ],
          }),
        handleDataRequest: () => new Response(null),
      },
    });
    const server = createServer((request, response) => {
      void handler(request, response, () => response.end());
    });
    onTestFinished(() => {
      server.close();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    const secure = mode === "production" ? "; Secure" : "";
    expect(response.headers.getSetCookie()).toEqual([
      `session=one${secure}; HttpOnly; SameSite=Lax`,
      `theme=dark${secure}; Path=/`,
    ]);
    expect(await response.text()).toBe("cookies");
  },
);

test("isolates application data endpoints on one origin and streams documents before their tail resolves", async () => {
  const { deferred } = await import("./helpers/deferred.ts");
  const tail = deferred<void>();
  const encoder = new TextEncoder();
  const handlers = ["", "/admin", "/remotes", "/embed"].map((base) => ({
    base,
    handle: createRequestHandler({
      entry: "/entry.js",
      dataEndpoint: `${base}/_smolter`,
      build: {
        default: () =>
          new Response(
            new ReadableStream({
              async start(controller) {
                controller.enqueue(encoder.encode("Shell"));
                await tail.promise;
                controller.enqueue(encoder.encode("Tail"));
                controller.close();
              },
            }),
          ),
        handleDataRequest: (request) =>
          Response.json(
            { app: base || "platform", method: request.method },
            { headers: { "Cache-Control": "public, max-age=3600" } },
          ),
      },
    }),
  }));
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://local").pathname;
    const selected =
      handlers.find(({ base }) => path === `${base}/_smolter`) ?? handlers[0];
    void selected.handle(request, response, () => response.end());
  });
  onTestFinished(() => {
    tail.resolve();
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const { base } of handlers) {
    for (const method of ["GET", "POST"]) {
      const response = await fetch(
        `${origin}${base}/_smolter?url=${base || "/"}`,
        { method },
      );
      expect(await response.json()).toEqual({
        app: base || "platform",
        method,
      });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  }
  const document = await fetch(origin);
  const reader = document.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("Shell");
  tail.resolve();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("Tail");
});

test("ends empty document responses without buffering a body", async () => {
  const handler = createRequestHandler({
    entry: "/entry.js",
    build: {
      default: () => new Response(null, { status: 204 }),
      handleDataRequest: () => new Response(null),
    },
  });
  const server = createServer((request, response) => {
    void handler(request, response, () => response.end());
  });
  onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
});
