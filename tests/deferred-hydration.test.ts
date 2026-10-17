import { expect, it, vi } from "vitest";
import { deferredHydration } from "../packages/server/src/deferred-hydration.ts";
import { progressiveDocument } from "../packages/server/src/progressive-document.ts";
import { deferred } from "./helpers/deferred.ts";

it("streams each deferred value independently, preserving shared and nested promise references", async () => {
  const slow = deferred<string>();
  const nested = deferred<string>();
  const fast = deferred<unknown>();
  const payload = deferredHydration(
    { slow: slow.promise, fast: [fast.promise, fast.promise] },
    'nonce"<&',
  );
  expect(JSON.parse(payload.initial)).toEqual({
    slow: { __smolterPending: 0 },
    fast: [{ __smolterPending: 1 }, { __smolterPending: 1 }],
  });
  const reader = payload.stream.getReader();
  fast.resolve({ nested: nested.promise });
  const decode = new TextDecoder();
  const first = decode.decode((await reader.read()).value);
  expect(first).toContain('[1,{"nested":{"__smolterPending":2}},null]');
  expect(first).toContain('nonce="nonce&quot;&lt;&amp;"');
  nested.resolve("</script>safe");
  expect(decode.decode((await reader.read()).value)).toContain(
    "\\u003c/script>safe",
  );
  slow.resolve("last");
  expect(decode.decode((await reader.read()).value)).toContain(
    '[0,"last",null]',
  );
  expect(decode.decode((await reader.read()).value)).toContain(
    "[-1,null,null]",
  );
  expect((await reader.read()).done).toBe(true);
});

it("serializes deferred errors and closes streams without pending data", async () => {
  const payload = deferredHydration([
    Promise.reject(new Error("Unavailable")),
    Promise.reject("Other"),
  ]);
  const text = await new Response(payload.stream).text();
  expect(text).toContain('[0,null,"Unavailable"]');
  expect(text).toContain('[1,null,"Other"]');
  expect(
    await new Response(deferredHydration({ value: 1 }).stream).text(),
  ).toBe("");
});

it("ignores settlements after cancellation", async () => {
  const value = deferred<string>();
  const payload = deferredHydration(value.promise);
  await payload.stream.cancel();
  value.resolve("ignored");
  await Promise.resolve();
});

it("interleaves data before document closing tags and retains the streaming container", async () => {
  const dispose = vi.fn();
  const encoder = new TextEncoder();
  const html = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of [
        "<html><body>shell",
        "<div hidden>",
        "</div></body></html>",
      ])
        controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const data = deferredHydration(Promise.resolve("data"));
  const result = await new Response(
    progressiveDocument(html, data.stream, {
      signal: new AbortController().signal,
      dispose,
    }),
  ).text();
  expect(result).toMatch(/^<!doctype html><html><body>shell/);
  expect(result).toContain("<div hidden data-smolter-stream>");
  expect(result).toMatch(/<\/body><\/html>$/);
  expect(result.indexOf('[0,"data",null]')).toBeLessThan(
    result.indexOf("</body>"),
  );
  expect(dispose).toHaveBeenCalledOnce();
});

for (const reason of [
  "abort",
  "cancel",
  "error",
  "data-error",
  "already-aborted",
  "empty",
]) {
  it(`disposes progressive streams on ${reason}`, async () => {
    const signal = new AbortController();
    const dispose = vi.fn();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        if (reason === "error") controller.error(new Error("failed"));
        if (reason === "empty" || reason === "data-error") controller.close();
      },
      cancel,
    });
    if (reason === "already-aborted") signal.abort();
    const settlements =
      reason === "data-error"
        ? new ReadableStream<Uint8Array>({
            start(controller) {
              controller.error(new Error("failed"));
            },
          })
        : deferredHydration(null).stream;
    const body = progressiveDocument(source, settlements, {
      signal: signal.signal,
      dispose,
    });
    if (reason === "cancel") await body.cancel();
    if (reason === "abort") signal.abort();
    if (reason === "error" || reason === "data-error")
      await expect(new Response(body).text()).rejects.toThrow("failed");
    if (reason !== "cancel" && reason !== "error" && reason !== "data-error")
      expect(await new Response(body).text()).toBe("");
    expect(dispose).toHaveBeenCalledOnce();
  });
}

it("turns non-serializable deferred values into boundary errors instead of hanging the stream", async () => {
  const payload = deferredHydration({ value: Promise.resolve(1n) });
  const result = await new Response(payload.stream).text();

  expect(result).toContain("BigInt");
  expect(result).toContain("[-1,null,null]");
});

it("distinguishes undefined deferred values from null", async () => {
  const payload = deferredHydration([
    Promise.resolve(undefined),
    Promise.resolve(null),
  ]);
  const result = await new Response(payload.stream).text();

  expect(result).toContain('[0,{"__smolterUndefined":true},null]');
  expect(result).toContain("[1,null,null]");
});
