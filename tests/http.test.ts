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

  await Promise.resolve()
    .then(async () => {
      const document = await fetch(`${base}/tasks`);
      expect(await document.text()).toBe("/tasks:/assets/client.js");
      expect(document.headers.get("X-Metrics-Middleware")).toBe("present");

      const action = await fetch(`${base}/_smolter?url=/tasks/1`, {
        method: "PATCH",
        body: "title=Updated",
      });
      expect(action.status).toBe(201);
      expect(action.headers.get("X-Action")).toBe("saved");
      expect(await action.text()).toBe("PATCH:/tasks/1:title=Updated");

      const invalid = await fetch(`${base}/_smolter?url=https://example.com`);
      expect(invalid.status).toBe(400);
      expect(requests).toBe(3);
    })
    .finally(() => server.close());
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
