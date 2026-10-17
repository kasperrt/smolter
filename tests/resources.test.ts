import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, test, vi } from "vitest";
import type { ResourceModule } from "../packages/core/src/resource-types.ts";
import { createResourceRouter } from "../packages/core/src/resources.ts";

describe("ResourceRouter", () => {
  test("caches mounted loader data and force reloads it", async () => {
    let loads = 0;
    const router = createDataRouter({
      loader: async () => {
        loads += 1;

        return { data: loads, error: "" };
      },
    });

    expect((await router.load<number>("test")).data).toBe(1);
    expect((await router.load<number>("test")).data).toBe(1);
    expect((await router.load<number>("test", {}, true)).data).toBe(2);
    router.dispose();
  });

  test("keeps expected loader failures out of the error boundary state", async () => {
    const router = createDataRouter({
      loader: async () => ({ data: null, error: "Try again." }),
    });

    await router.load("test");

    expect(router.getSnapshot("test", {}).loaderError).toBe("Try again.");
    expect(router.getSnapshot("test", {}).unexpectedError).toBe(false);
    router.dispose();
  });

  test("sanitizes thrown loader failures for route boundaries", async () => {
    const router = createDataRouter({
      loader: async () => {
        throw new Error("private backend detail");
      },
    });

    const result = await router.load("test");

    expect(result.error).toBe("The route could not be loaded.");
    expect(result.error).not.toContain("private backend detail");
    expect(router.getSnapshot("test", {}).unexpectedError).toBe(true);
    router.dispose();
  });

  test("aborts and evicts a route after its last subscriber unmounts", async () => {
    let observedSignal: AbortSignal | null = null;
    const router = createDataRouter({
      loader: ({ signal }) => {
        observedSignal = signal;

        return new Promise(() => undefined);
      },
    });
    const unsubscribe = router.subscribe("test", {}, () => undefined);
    void router.load("test");

    unsubscribe();
    await sleep(150);

    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(router.getSnapshot("test", {}).loaderInitialized).toBe(false);
    router.dispose();
  });

  test("delayed cleanup cancels both handlers using the original route key", async (context) => {
    vi.useFakeTimers();
    context.onTestFinished(() => {
      vi.useRealTimers();
    });

    const signals: AbortSignal[] = [];
    const pending = ({ signal }: ResourceHandlerArgs) => {
      signals.push(signal);

      return new Promise<never>(() => undefined);
    };
    const router = createDataRouter({ loader: pending, action: pending });
    const params = { id: "original" };
    const unsubscribe = router.subscribe("test", params, () => undefined);

    context.onTestFinished(() => router.dispose());
    void router.load("test", params);
    void router.submit("test", {}, params);
    await Promise.resolve();

    expect(signals).toHaveLength(2);
    unsubscribe();
    params.id = "other";
    router.hydrateRoute("test", "retained", params);
    await vi.advanceTimersByTimeAsync(100);

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(router.getSnapshot("test", { id: "original" }).loaderState).toBe(
      "idle",
    );
    expect(router.getSnapshot("test", params).loaderData).toBe("retained");
  });

  test("keeps a persistent route until it is explicitly disposed", async () => {
    let loads = 0;
    const router = createDataRouter({
      loader: async () => {
        loads += 1;

        return { data: loads, error: "" };
      },
    });
    router.persist("test");
    const unsubscribe = router.subscribe("test", {}, () => undefined);
    await router.load("test");

    unsubscribe();
    await sleep(150);

    expect(router.getSnapshot("test", {}).loaderData).toBe(1);
    expect((await router.load<number>("test")).data).toBe(1);

    router.disposeRoute("test");

    expect(router.getSnapshot("test", {}).loaderInitialized).toBe(false);
    router.dispose();
  });

  test("hydrates a route without repeating its loader", async () => {
    let loads = 0;
    const router = createDataRouter({
      loader: async () => {
        loads += 1;

        return { data: loads, error: "" };
      },
    });

    router.hydrateRoute("test", 42);

    expect((await router.load<number>("test")).data).toBe(42);
    expect(loads).toBe(0);
    router.dispose();
  });

  test("runs independent fetcher actions without shared route cancellation", async () => {
    const completed: string[] = [];
    const router = createDataRouter({
      action: async ({ input, signal }) => {
        await sleep(input === "first" ? 20 : 5);

        if (!signal.aborted) completed.push(String(input));

        return { data: String(input), error: "" };
      },
    });
    const first = new AbortController();
    const second = new AbortController();

    const results = await Promise.all([
      router.fetchAction<string>("test", "first", {}, first.signal),
      router.fetchAction<string>("test", "second", {}, second.signal),
    ]);

    expect(results.map((result) => result.data)).toEqual(["first", "second"]);
    expect(completed).toEqual(["second", "first"]);
    router.dispose();
  });
});

function createDataRouter(route: ResourceModule) {
  return createResourceRouter(new Map([["test", route]]));
}

interface ResourceHandlerArgs {
  signal: AbortSignal;
}
