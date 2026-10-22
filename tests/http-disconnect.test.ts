import { once } from "node:events";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { type AddressInfo, Socket } from "node:net";
import { safeWrapAsync } from "@smolter/core";
import { expect, onTestFinished, test, vi } from "vitest";
import { createRequestHandler } from "../packages/server/src/handler.ts";
import { send, webRequest } from "../packages/server/src/http.ts";
import { deferred } from "./helpers/deferred.ts";

async function host(
  render: (request: Request) => Response | Promise<Response>,
) {
  const complete = deferred<void>();
  const connected = deferred<ServerResponse>();
  const next = vi.fn();
  const handler = createRequestHandler({
    entry: "/entry.js",
    build: { default: render, handleDataRequest: render },
  });
  const server = createServer(async (incoming, outgoing) => {
    connected.resolve(outgoing);
    await handler(incoming, outgoing, next);
    complete.resolve();
  });
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    complete: complete.promise,
    connected: connected.promise,
    next,
  };
}

test.each(["/", "/room.__smolter"])(
  "cancels a late response after the client disconnects: %s",
  async (path) => {
    const started = deferred<Request>();
    const release = deferred<void>();
    const cancel = vi.fn();
    const fixture = await host(async (request) => {
      started.resolve(request);
      await release.promise;
      return new Response(new ReadableStream({ cancel }));
    });
    onTestFinished(() => release.resolve());
    const controller = new AbortController();
    const pending = safeWrapAsync(() =>
      fetch(fixture.origin + path, { signal: controller.signal }),
    );
    const request = await started.promise;
    const outgoing = await fixture.connected;
    const closed = once(outgoing, "close");
    controller.abort();
    await closed;
    expect((await pending).error).toBeInstanceOf(Error);
    expect(request.signal.aborted).toBe(true);
    const headers = vi.spyOn(outgoing, "setHeader");
    release.resolve();
    await fixture.complete;
    expect(fixture.next).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  },
);

test("cancels an active body without forwarding a client disconnect", async () => {
  const cancel = vi.fn();
  let signal: AbortSignal | undefined;
  const fixture = await host((request) => {
    signal = request.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Shell"));
        },
        cancel,
      }),
    );
  });
  const controller = new AbortController();
  const response = await fetch(fixture.origin, { signal: controller.signal });
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("Shell");
  controller.abort();
  await fixture.complete;
  expect(signal?.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fixture.next).not.toHaveBeenCalled();
});

test.each([undefined, "ERR_STREAM_PREMATURE_CLOSE", "ECONNRESET"])(
  "still forwards a genuine source failure with code %s",
  async (code) => {
    const failure = Object.assign(new Error("Renderer failed"), { code });
    const fixture = await host(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(failure);
            },
          }),
        ),
    );
    await safeWrapAsync(() => fetch(fixture.origin));
    await fixture.complete;
    expect(fixture.next).toHaveBeenCalledOnce();
    expect(fixture.next.mock.calls[0][0].cause).toBe(failure);
  },
);

test("forwards renderer rejection even after disconnection", async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  const failure = new Error("Render failed after abort");
  const fixture = await host(async () => {
    started.resolve();
    await release.promise;
    throw failure;
  });
  onTestFinished(() => release.resolve());
  const controller = new AbortController();
  const pending = safeWrapAsync(() =>
    fetch(fixture.origin, { signal: controller.signal }),
  );
  await started.promise;
  const closed = once(await fixture.connected, "close");
  controller.abort();
  await closed;
  await pending;
  release.resolve();
  await fixture.complete;
  expect(fixture.next).toHaveBeenCalledOnce();
  expect(fixture.next.mock.calls[0][0].cause).toBe(failure);
});

test.each(["closed", "ended"])(
  "handles an already %s response without writing headers",
  async (state) => {
    const incoming = new IncomingMessage(new Socket());
    incoming.headers.host = "localhost";
    incoming.method = "GET";
    incoming.push(null);
    const outgoing = new ServerResponse(incoming);
    if (state === "closed") outgoing.destroy();
    else outgoing.end();
    const cancel = vi.fn();
    const headers = vi.spyOn(outgoing, "setHeader");
    const request = await webRequest(incoming, outgoing);
    expect(request.signal.aborted).toBe(true);
    await send(new Response(new ReadableStream({ cancel })), outgoing);
    await send(new Response(null, { status: 204 }), outgoing);
    expect(cancel).toHaveBeenCalledOnce();
    expect(headers).not.toHaveBeenCalled();
    incoming.destroy();
  },
);

test("preserves a late body cancellation failure", async () => {
  const incoming = new IncomingMessage(new Socket());
  const outgoing = new ServerResponse(incoming);
  outgoing.destroy();
  const failure = new Error("Cancellation failed");
  await expect(
    send(
      new Response(
        new ReadableStream({
          cancel() {
            throw failure;
          },
        }),
      ),
      outgoing,
    ),
  ).rejects.toBe(failure);
  incoming.destroy();
});

test.each(["source", "destination", "destroy"])(
  "forwards a %s failure after the shell has been sent",
  async (owner) => {
    const failure = new Error("Stream failed after shell");
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const fixture = await host(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              source = controller;
              controller.enqueue(new TextEncoder().encode("Shell"));
            },
          }),
        ),
    );
    const response = await fetch(fixture.origin);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("Shell");
    if (owner === "source") source.error(failure);
    else if (owner === "destroy") (await fixture.connected).destroy(failure);
    else (await fixture.connected).emit("error", failure);
    await fixture.complete;
    expect(fixture.next).toHaveBeenCalledOnce();
    expect(fixture.next.mock.calls[0][0].cause).toBe(failure);
  },
);
