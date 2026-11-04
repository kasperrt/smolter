import { once } from "node:events";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type { TestContext } from "vitest";
import { expect, it, vi } from "vitest";
import { createRequestHandler } from "../src/handler.ts";

async function host(context: TestContext, maxBodySize?: number) {
  const action = vi.fn(
    async (request: Request) => new Response(await request.text()),
  );
  const next = vi.fn();
  const handler = createRequestHandler({
    entry: "/entry.js",
    maxBodySize,
    dataEndpoint: "/_smolter",
    build: { default: action, handleDataRequest: action },
  });
  const server = createServer((request, response) => {
    void handler(request, response, (error) => {
      next(error);
      response.statusCode = 500;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.onTestFinished(() => {
    server.closeAllConnections();
    server.close();
  });
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    action,
    next,
  };
}

it("caps default document and both data request bodies before application work", async (context) => {
  const { origin, action, next } = await host(context);
  for (const path of ["/", "/account.__smolter", "/_smolter?url=%2Faccount"]) {
    const response = await fetch(origin + path, {
      method: "POST",
      body: new Uint8Array(1_048_577),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toBe("Request body too large");
  }
  expect(action).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it("rejects oversized chunked uploads without waiting for the sender to finish", async (context) => {
  const { origin, action } = await host(context, 16);
  const request = httpRequest(origin, {
    method: "POST",
    headers: { "Transfer-Encoding": "chunked" },
  });
  context.onTestFinished(() => {
    request.destroy();
  });
  const received = once(request, "response");
  request.write("12345678901234567");
  const [response] = await received;
  expect(response.statusCode).toBe(413);
  expect(request.writableEnded).toBe(false);
  expect(action).not.toHaveBeenCalled();
  response.resume();
  request.destroy();
});

it("rejects declared lengths and forbidden origins before reading any upload bytes", async (context) => {
  const { origin, action } = await host(context, 16);
  for (const foreign of [false, true]) {
    const request = httpRequest(origin, {
      method: "POST",
      headers: {
        "Content-Length": "1000000",
        ...(foreign && { Origin: "https://attacker.example" }),
      },
    });
    context.onTestFinished(() => {
      request.destroy();
    });
    const received = once(request, "response");
    request.flushHeaders();
    const [response] = await received;
    expect(response.statusCode).toBe(foreign ? 403 : 413);
    expect(request.writableEnded).toBe(false);
    response.resume();
    request.destroy();
  }
  expect(action).not.toHaveBeenCalled();
});

it("preserves exact-limit uploads, configured larger bodies and zero-body operation", async (context) => {
  for (const limit of [0, 16, 1_048_577]) {
    const { origin, action } = await host(context, limit);
    const body = "x".repeat(limit);
    const response = await fetch(origin, { method: "POST", body });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(action).toHaveBeenCalledOnce();
  }
});

for (const limit of [-1, 0.5, Infinity, NaN]) {
  it(`rejects invalid maxBodySize ${limit}`, async (context) => {
    const { origin, action, next } = await host(context, limit);
    expect((await fetch(origin)).status).toBe(500);
    expect(action).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0].cause).toBeInstanceOf(RangeError);
  });
}
