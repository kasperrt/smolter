import { safeWrapAsync } from "@smolter/core";
import { expect, it } from "vitest";

it("defers guarded work unless mutation ownership explicitly requires an immediate start", async () => {
  const order: string[] = [];
  const deferred = safeWrapAsync(() => {
    order.push("deferred");
    return "later";
  });
  const immediate = safeWrapAsync(() => {
    order.push("immediate");
    return "now";
  }, true);
  expect(order).toEqual(["immediate"]);
  expect(await immediate).toEqual({ data: "now" });
  expect(await deferred).toEqual({ data: "later" });
  expect(order).toEqual(["immediate", "deferred"]);
});

it("normalizes synchronous failures during immediate guarded work", async () => {
  const failure = Error("Submission failed");
  const pending = safeWrapAsync(() => {
    throw failure;
  }, true);
  expect((await pending).error?.cause).toBe(failure);
});
