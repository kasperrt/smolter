import { expect, it, vi } from "vitest";
import type { DataResult } from "../packages/core/src/resource-types.ts";
import { createResourceRouter } from "../packages/core/src/resources.ts";
import { deferred } from "./helpers/deferred.ts";

it("deduplicates reads and prevents a replaced loader from overwriting newer data", async (context) => {
  const first = deferred<DataResult<number>>();
  const second = deferred<DataResult<number>>();
  const signals: AbortSignal[] = [];
  const router = createResourceRouter(
    new Map([
      [
        "item",
        {
          loader: ({ signal }) => {
            signals.push(signal);

            return signals.length === 1 ? first.promise : second.promise;
          },
        },
      ],
    ]),
  );

  context.onTestFinished(() => router.dispose());
  const original = router.load("item");
  expect(router.load("item")).toBe(original);
  await Promise.resolve();

  const replacement = router.load("item", {}, true);
  await Promise.resolve();
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);

  second.resolve({ data: 2, error: "" });
  await replacement;
  first.resolve({ data: 1, error: "" });

  expect(await original).toEqual({ data: null, error: "" });
  expect(router.getSnapshot("item", {}).loaderData).toBe(2);
});

it("replaces shared actions without publishing stale results or revalidating twice", async (context) => {
  const first = deferred<DataResult<string>>();
  const signals: AbortSignal[] = [];
  let loads = 0;
  const router = createResourceRouter(
    new Map([
      [
        "item",
        {
          loader: async () => ({ data: ++loads, error: "" }),
          action: ({ signal }) => {
            signals.push(signal);

            return signals.length === 1
              ? first.promise
              : Promise.resolve({ data: "new", error: "" });
          },
        },
      ],
    ]),
  );

  context.onTestFinished(() => router.dispose());
  const original = router.submit("item", "old");
  await Promise.resolve();
  expect(await router.submit("item", "new")).toEqual({
    data: "new",
    error: "",
  });

  first.resolve({ data: "old", error: "" });
  expect(await original).toEqual({ data: null, error: "" });
  expect(signals[0].aborted).toBe(true);
  expect(loads).toBe(1);
  expect(router.getSnapshot("item", {})).toMatchObject({
    actionData: "new",
    loaderData: 1,
    actionState: "idle",
    navigationState: "idle",
  });
});

it("reports missing handlers and sanitizes independent request failures", async (context) => {
  const router = createResourceRouter(
    new Map([
      [
        "broken",
        {
          loader: () => Promise.reject(Error("private loader detail")),
          action: () => Promise.reject(Error("private action detail")),
        },
      ],
    ]),
  );
  const signal = new AbortController().signal;

  context.onTestFinished(() => router.dispose());
  expect(router.getRoute("missing")).toBeNull();
  expect((await router.load("missing")).error).toBe("Route loader not found.");
  expect((await router.fetchLoader("missing", {}, signal)).error).toBe(
    "Route loader not found.",
  );
  expect((await router.submit("missing", {})).error).toBe(
    "Route action not found.",
  );
  expect((await router.fetchAction("missing", {}, {}, signal)).error).toBe(
    "Route action not found.",
  );

  const untouched = router.getSnapshot("broken", {});
  expect(await router.fetchLoader("broken", {}, signal)).toEqual({
    data: null,
    error: "The route could not be loaded.",
    unexpected: true,
  });
  expect(await router.fetchAction("broken", {}, {}, signal)).toEqual({
    data: null,
    error: "The request could not be completed.",
    unexpected: true,
  });
  expect(router.getSnapshot("broken", {})).toBe(untouched);

  const result = await router.submit("broken", {});
  expect(result.unexpected).toBe(true);
  expect(result.error).not.toContain("private");
  expect(router.getSnapshot("broken", {})).toMatchObject({
    actionError: result.error,
    actionState: "idle",
    unexpectedError: true,
  });
});

it("can retain a route during the cleanup grace period and retry its loader", async (context) => {
  vi.useFakeTimers();
  let loads = 0;
  const router = createResourceRouter(
    new Map([["item", { loader: async () => ({ data: ++loads, error: "" }) }]]),
  );

  context.onTestFinished(() => {
    router.dispose();
    vi.useRealTimers();
  });
  const unsubscribe = router.subscribe("item", {}, () => {});
  await router.load("item");
  unsubscribe();
  router.persist("item");
  await vi.advanceTimersByTimeAsync(100);
  expect(router.getSnapshot("item", {}).loaderData).toBe(1);

  router.reportUnexpected("item", {});
  expect(router.getSnapshot("item", {}).unexpectedError).toBe(true);
  await router.retry("item", {});
  expect(router.getSnapshot("item", {})).toMatchObject({
    loaderData: 2,
    unexpectedError: false,
  });

  router.disposeRoute("item");
  expect(router.getSnapshot("item", {}).loaderInitialized).toBe(false);
});

it("does not start revalidation when an independent action is aborted by its policy", async (context) => {
  const controller = new AbortController();
  let loads = 0;
  const router = createResourceRouter(
    new Map([
      [
        "item",
        {
          loader: async () => ({ data: ++loads, error: "" }),
          action: async () => ({ data: "saved", error: "" }),
          shouldRevalidate: () => {
            controller.abort();

            return true;
          },
        },
      ],
    ]),
  );

  context.onTestFinished(() => router.dispose());
  const result = await router.fetchAction("item", {}, {}, controller.signal);

  expect(loads).toBe(0);
  expect(result).toEqual({ data: null, error: "" });
  expect(router.getSnapshot("item", {}).loaderInitialized).toBe(false);
});

it("sanitizes revalidation policy failures without starting a loader", async (context) => {
  let loads = 0;
  const policy = vi.fn(() => {
    throw Error("private policy detail");
  });
  const router = createResourceRouter(
    new Map([
      [
        "item",
        {
          loader: async () => ({ data: ++loads, error: "" }),
          action: async () => ({ data: "saved", error: "" }),
          shouldRevalidate: policy,
        },
      ],
    ]),
  );

  context.onTestFinished(() => router.dispose());
  const shared = await router.submit("item", {}, { id: "7" });
  const independent = await router.fetchAction(
    "item",
    {},
    { id: "7" },
    new AbortController().signal,
  );

  expect(shared).toEqual({
    data: null,
    error: "The request could not be completed.",
    unexpected: true,
  });
  expect(independent).toEqual(shared);
  expect(loads).toBe(0);
  expect(policy).toHaveBeenCalledTimes(2);
  expect(policy).toHaveBeenCalledWith({
    actionResult: { data: "saved", error: "" },
    defaultShouldRevalidate: true,
    params: { id: "7" },
  });
  expect(router.getSnapshot("item", { id: "7" })).toMatchObject({
    actionError: shared.error,
    actionState: "idle",
    unexpectedError: true,
  });
});

it("ignores repeated unsubscribe calls after a new subscriber takes over", async (context) => {
  vi.useFakeTimers();
  let loads = 0;
  const notify = vi.fn();
  const router = createResourceRouter(
    new Map([["item", { loader: async () => ({ data: ++loads, error: "" }) }]]),
  );

  context.onTestFinished(() => {
    router.dispose();
    vi.useRealTimers();
  });
  const first = router.subscribe("item", {}, () => {});
  await router.load("item");
  first();

  const second = router.subscribe("item", {}, notify);
  first();
  await vi.advanceTimersByTimeAsync(100);

  expect(router.getSnapshot("item", {}).loaderData).toBe(1);
  await router.load("item", {}, true);
  expect(notify).toHaveBeenCalled();
  expect(router.getSnapshot("item", {}).loaderData).toBe(2);
  second();
});

it("disposes pending handlers and shares equivalent parameter keys", async () => {
  const pending = deferred<DataResult<number>>();
  const signals: AbortSignal[] = [];
  const work = ({ signal }: ResourceWorkArgs) => {
    signals.push(signal);

    return pending.promise;
  };
  const router = createResourceRouter(
    new Map([["item", { loader: work, action: work }]]),
  );
  const params = { b: "2", a: "1" };
  const load = router.load("item", params);
  const equivalent = router.load("item", { a: "1", b: "2" });
  const action = router.submit("item", {}, params);

  expect(equivalent).toBe(load);
  await Promise.resolve();
  expect(signals).toHaveLength(2);

  router.dispose();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  pending.resolve({ data: 1, error: "" });

  expect(await load).toEqual({ data: null, error: "" });
  expect(await action).toEqual({ data: null, error: "" });
  expect(router.getSnapshot("item", params).loaderInitialized).toBe(false);
  expect(signals).toHaveLength(2);
});

interface ResourceWorkArgs {
  signal: AbortSignal;
}
