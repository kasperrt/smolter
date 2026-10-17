import { expect, it, vi } from "vitest";
import {
  type DeferredWindow,
  readHydration,
} from "../../packages/preact/src/deferred-hydration.ts";

const deferredWindow = window as DeferredWindow;

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
