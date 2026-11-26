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

it("revives nested objects, arrays, literals and undefined in deferred settlements", async (context) => {
  const state = vi
    .spyOn(document, "readyState", "get")
    .mockReturnValue("loading");
  Reflect.deleteProperty(window, "__smolterDeferred");
  context.onTestFinished(() => {
    state.mockRestore();
    Reflect.deleteProperty(window, "__smolterDeferred");
  });
  const { hydration, dispose } = readHydration(
    '{"a":{"__smolterPending":0},"b":{"__smolterPending":1}}',
  );
  const queue = (window as DeferredWindow).__smolterDeferred;
  queue?.push([
    0,
    [
      "text",
      {
        nested: { __smolterLiteral: ["__smolterPending", 9] },
      },
    ],
    null,
  ]);
  queue?.push([1, { __smolterUndefined: true }, null]);
  expect(await hydration.a).toEqual([
    "text",
    { nested: { __smolterPending: 9 } },
  ]);
  expect(await hydration.b).toBeUndefined();
  dispose();
});
