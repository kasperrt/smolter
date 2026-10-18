import { expect, it, vi } from "vitest";
import {
  type DeferredWindow,
  readHydration,
} from "../../packages/client/src/hydration.ts";

const deferredWindow = window as DeferredWindow;

it("bounds unfinished streams without retrying or waiting for document completion", async (context) => {
  vi.useFakeTimers();
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => {
    state.mockRestore();
    vi.useRealTimers();
  });
  Reflect.deleteProperty(window, "__smolterDeferred");
  const { hydration, dispose } = readHydration(
    '{"pending":{"__smolterPending":0}}',
    100,
  );
  const rejected = expect(hydration.pending).rejects.toThrow(
    "Hydration stream timed out",
  );
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(deferredWindow.__smolterDeferred?.push([0, "late", null])).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  dispose();
});

it("cancels the deadline on settlement completion and does not schedule it for resolved data", async (context) => {
  vi.useFakeTimers();
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => {
    state.mockRestore();
    vi.useRealTimers();
  });
  Reflect.deleteProperty(window, "__smolterDeferred");
  const resolved = readHydration('{"value":42}');
  expect(vi.getTimerCount()).toBe(0);
  resolved.dispose();
  const { hydration } = readHydration(
    '{"pending":{"__smolterPending":0}}',
    100,
  );
  expect(vi.getTimerCount()).toBe(1);
  deferredWindow.__smolterDeferred?.push([0, "done", null], [-1, null, null]);
  expect(await hydration.pending).toBe("done");
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects invalid deferred deadlines before creating pending promises", () => {
  for (const timeout of [
    0,
    0.5,
    1.5,
    -1,
    NaN,
    Infinity,
    -Infinity,
    2_147_483_648,
  ])
    expect(() => readHydration("{}", timeout)).toThrow(RangeError);
});

it("revives shared promises and nested settlements before or after the browser entry loads", async (context) => {
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => state.mockRestore());
  deferredWindow.__smolterDeferred = [
    [0, { nested: { __smolterPending: 1 } }, null],
  ];
  const { hydration, dispose } = readHydration(
    '{"first":{"__smolterPending":0},"same":{"__smolterPending":0}}',
  );
  expect(hydration.first).toBe(hydration.same);
  deferredWindow.__smolterDeferred.push([
    1,
    { __smolterUndefined: true },
    null,
  ]);
  expect(await (await hydration.first).nested).toBeUndefined();
  deferredWindow.__smolterDeferred.push([99, "unknown", null]);
  deferredWindow.__smolterDeferred.push([-1, null, null]);
  expect(deferredWindow.__smolterDeferred.push([99, "ignored", null])).toBe(0);
  dispose();
});

it("preserves streamed and legacy rejected values and rejects unfinished data on disposal", async (context) => {
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => state.mockRestore());
  Reflect.deleteProperty(window, "__smolterDeferred");
  const { hydration, dispose } = readHydration(
    '{"legacy":{"__smolterRejected":{"message":"legacy"}},"pending":{"__smolterPending":0},"cancel":{"__smolterPending":1}}',
  );
  await expect(hydration.legacy).rejects.toThrow("legacy");
  deferredWindow.__smolterDeferred?.push([0, null, "streamed"]);
  await expect(hydration.pending).rejects.toThrow("streamed");
  dispose();
  await expect(hydration.cancel).rejects.toThrow("Hydration stream closed");
});

it("rejects unfinished values when the document ends without a settlement", async (context) => {
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => state.mockRestore());
  Reflect.deleteProperty(window, "__smolterDeferred");
  const { hydration } = readHydration('{"pending":{"__smolterPending":0}}');
  window.dispatchEvent(new Event("DOMContentLoaded"));
  await expect(hydration.pending).rejects.toThrow("Hydration stream closed");
});

it("uses a total budget across settlements and preserves settled shared values", async (context) => {
  vi.useFakeTimers();
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  context.onTestFinished(() => {
    state.mockRestore();
    vi.useRealTimers();
  });
  Reflect.deleteProperty(window, "__smolterDeferred");
  const { hydration } = readHydration(
    JSON.stringify({
      settled: { __smolterPending: 0 },
      first: { __smolterPending: 1 },
      shared: { __smolterPending: 1 },
      second: { __smolterPending: 2 },
    }),
    100,
  );
  expect(hydration.first).toBe(hydration.shared);
  await vi.advanceTimersByTimeAsync(80);
  deferredWindow.__smolterDeferred?.push([0, "retained", null]);
  expect(await hydration.settled).toBe("retained");
  const results = Promise.allSettled([
    hydration.first,
    hydration.shared,
    hydration.second,
  ]);
  await vi.advanceTimersByTimeAsync(20);
  for (const result of await results) {
    expect(result.status).toBe("rejected");
    if (result.status === "rejected")
      expect(result.reason.message).toBe("Hydration stream timed out");
  }
  deferredWindow.__smolterDeferred?.push(
    [0, "overwrite", null],
    [1, "late", null],
  );
  expect(await hydration.settled).toBe("retained");
  await expect(hydration.first).rejects.toThrow("Hydration stream timed out");
  expect(vi.getTimerCount()).toBe(0);
});

it("disposal clears its deadline and completion listener", async (context) => {
  vi.useFakeTimers();
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  const remove = vi.spyOn(window, "removeEventListener");
  context.onTestFinished(() => {
    state.mockRestore();
    remove.mockRestore();
    vi.useRealTimers();
  });
  Reflect.deleteProperty(window, "__smolterDeferred");
  const { hydration, dispose } = readHydration(
    '{"pending":{"__smolterPending":0}}',
    100,
  );
  dispose();
  expect(remove).toHaveBeenCalledWith("DOMContentLoaded", dispose);
  expect(vi.getTimerCount()).toBe(0);
  await expect(hydration.pending).rejects.toThrow("Hydration stream closed");
  deferredWindow.__smolterDeferred?.push([0, "late", null]);
  await vi.advanceTimersByTimeAsync(100);
  await expect(hydration.pending).rejects.toThrow("Hydration stream closed");
});
