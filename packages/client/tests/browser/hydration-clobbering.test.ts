import {
  type DeferredWindow,
  hydrationPayload,
  readHydration,
} from "@smolter/client/hydration";
import { expect, it, vi } from "vitest";

it("reads only the Smolter JSON script when untrusted markup reuses its id", (context) => {
  const forged = document.createElement("div");
  const payload = document.createElement("script");
  forged.id = "smolter-data";
  forged.textContent = '{"root":"Forged"}';
  payload.id = "smolter-data";
  payload.type = "application/json";
  payload.textContent = '{"root":"Server"}';
  document.body.append(forged, payload);
  context.onTestFinished(() => {
    forged.remove();
    payload.remove();
  });
  expect(document.getElementById("smolter-data")).toBe(forged);
  expect(hydrationPayload()).toBe('{"root":"Server"}');
  payload.textContent = "";
  expect(hydrationPayload()).toBe("");
  payload.remove();
  expect(hydrationPayload()).toBeUndefined();
});

it("replaces a named element that shadows the deferred settlement queue", async (context) => {
  const anchor = document.createElement("a");
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  anchor.id = "__smolterDeferred";
  Reflect.deleteProperty(window, "__smolterDeferred");
  document.body.append(anchor);
  context.onTestFinished(() => {
    state.mockRestore();
    anchor.remove();
    Reflect.deleteProperty(window, "__smolterDeferred");
  });
  expect(Reflect.get(window, "__smolterDeferred")).toBe(anchor);
  const { hydration, dispose } = readHydration(
    '{"pending":{"__smolterPending":0}}',
  );
  const queue = (window as DeferredWindow).__smolterDeferred;
  expect(Array.isArray(queue)).toBe(true);
  queue?.push([0, "Settled", null]);
  expect(await hydration.pending).toBe("Settled");
  dispose();
});
