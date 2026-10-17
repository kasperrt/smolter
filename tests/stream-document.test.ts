import { expect, it, vi } from "vitest";
import {
  resolveHydration,
  streamDocument,
} from "../packages/server/src/stream-document.ts";
import { deferred } from "./helpers/deferred.ts";

it("encodes deferred failures without rejecting the entire hydration payload", async () => {
  expect(
    await resolveHydration([
      Promise.reject(new Error("Unavailable")),
      Promise.reject("Rejected"),
    ]),
  ).toEqual([
    { __smolterRejected: { message: "Unavailable" } },
    { __smolterRejected: { message: "Rejected" } },
  ]);
});

it("propagates source errors and disposes the request", async () => {
  const dispose = vi.fn();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("Stream failed"));
    },
  });
  const response = new Response(
    streamDocument(source, {
      hydration: Promise.resolve({}),
      signal: new AbortController().signal,
      dispose,
    }),
  );
  await expect(response.text()).rejects.toThrow("Stream failed");
  expect(dispose).toHaveBeenCalledOnce();
});

it("cancels outstanding rendering when the response consumer disconnects", async () => {
  const cancel = vi.fn();
  const dispose = vi.fn();
  const source = new ReadableStream<Uint8Array>({ cancel });
  const body = streamDocument(source, {
    hydration: Promise.resolve({}),
    signal: new AbortController().signal,
    dispose,
  });
  await body.cancel();
  expect(cancel).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it("aborts pending reads and hydration even if a deferred field never settles", async () => {
  for (const closed of [false, true]) {
    const signal = new AbortController();
    const dispose = vi.fn();
    const hydration = deferred<void>();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        if (closed) controller.close();
      },
    });
    const body = streamDocument(source, {
      hydration: hydration.promise,
      signal: signal.signal,
      dispose,
    });
    const pending = body.getReader().read();
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.abort();
    expect((await pending).done).toBe(true);
    expect(dispose).toHaveBeenCalled();
  }
});

it("handles pre-aborted requests, cancellation during hydration, and CSP nonce escaping", async () => {
  const aborted = new AbortController();
  aborted.abort();
  const empty = new ReadableStream<Uint8Array>();
  expect(
    await new Response(
      streamDocument(empty, {
        hydration: Promise.resolve({}),
        signal: aborted.signal,
        dispose: () => {},
      }),
    ).text(),
  ).toBe("");
  const hydration = deferred<void>();
  const pending = streamDocument(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    {
      hydration: hydration.promise,
      signal: new AbortController().signal,
      dispose: () => {},
    },
  );
  const reader = pending.getReader();
  const read = reader.read();
  await Promise.resolve();
  await reader.cancel();
  expect((await read).done).toBe(true);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode("<!doctype html><html><body></body></html>"),
      );
      controller.close();
    },
  });
  const html = await new Response(
    streamDocument(source, {
      hydration: Promise.resolve({}),
      nonce: 'a&"<',
      signal: new AbortController().signal,
      dispose: () => {},
    }),
  ).text();
  expect(html).toContain('nonce="a&amp;&quot;&lt;"');
  expect(html.match(/<!doctype/g)).toHaveLength(1);
});
