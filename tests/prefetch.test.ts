import { createDataRouter } from "@smolter/core";
import { expect, it, vi } from "vitest";
import { deferred } from "./helpers/deferred.ts";

it("deduplicates reads, reuses navigation data once, and preserves query/hash without publishing speculative state", async () => {
  const gate = deferred<string>();
  const loader = vi.fn(() => gate.promise);
  const router = createDataRouter([{ path: "/item", loader }]);
  const snapshot = router.getSnapshot();
  const listener = vi.fn();
  router.subscribe(listener);
  const first = router.prefetch("/item?q=1#one");
  const second = router.prefetch("/item?q=1#two");
  expect(first).toBe(second);
  await expect.poll(() => loader.mock.calls.length).toBe(1);
  expect(loader.mock.calls[0]).toEqual([
    expect.objectContaining({ reason: "prefetch" }),
  ]);
  expect(router.getSnapshot()).toBe(snapshot);
  expect(listener).not.toHaveBeenCalled();
  const navigation = router.navigate("/item?q=1#target");
  gate.resolve("prefetched");
  await navigation;
  expect(router.getSnapshot()).toMatchObject({
    data: "prefetched",
    url: "http://localhost/item?q=1#target",
  });
  expect(loader).toHaveBeenCalledTimes(1);
  await router.navigate("/item?q=1");
  expect(loader).toHaveBeenCalledTimes(2);
  router.dispose();
});

it("does not cache errors or redirect Responses and retries on navigation", async () => {
  for (const failure of [
    Error("offline"),
    new Response(null, { status: 302, headers: { Location: "/login" } }),
  ]) {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValue("fresh");
    const router = createDataRouter([{ path: "/item", loader }]);
    await router.prefetch("/item");
    expect(router.getSnapshot().url).toBe("http://localhost/");
    await router.navigate("/item");
    expect(router.getSnapshot().data).toBe("fresh");
    expect(loader).toHaveBeenCalledTimes(2);
    router.dispose();
  }
});

it("expires and bounds cached reads, ignores external/unknown routes and cleans up on disposal", async () => {
  const signals: AbortSignal[] = [];
  const router = createDataRouter([
    {
      path: "/:id",
      loader: ({ signal }) => {
        signals.push(signal);
        return signals.length;
      },
    },
  ]);
  expect(await router.prefetch("https://outside.test/item")).toEqual({});
  expect(await router.prefetch("/missing/route")).toEqual({});
  await router.prefetch("/0");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30_001);
  await router.navigate("/0");
  expect(signals[0].aborted).toBe(true);
  expect(signals).toHaveLength(2);
  for (let n = 0; n < 17; n++) await router.prefetch(`/${n}`);
  expect(signals[2].aborted).toBe(true);
  router.dispose();
  expect(signals.at(-1)?.aborted).toBe(true);
  vi.restoreAllMocks();
});

it("replaces expired prefetches and caches absent loaders as completed undefined data", async () => {
  const loader = vi.fn(() => "data");
  const router = createDataRouter([
    { path: "/item", loader },
    { path: "/empty" },
  ]);
  await router.prefetch("/item");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30_001);
  await router.prefetch("/item");
  expect(loader).toHaveBeenCalledTimes(2);
  await router.prefetch("/empty");
  await router.navigate("/empty");
  expect(router.getSnapshot()).toMatchObject({ loaded: true, data: undefined });
  vi.restoreAllMocks();
  router.dispose();
});

it("invalidates on revalidation and overlapping page/fetcher mutations, including failures", async () => {
  const page = deferred<unknown>();
  const fetcherAction = deferred<unknown>();
  const loader = vi.fn(() => "fresh");
  const router = createDataRouter([
    { path: "/", loader },
    { path: "/page", action: () => page.promise },
    { path: "/fetcher", action: () => fetcherAction.promise },
  ]);
  await router.prefetch("/");
  await router.revalidate();
  await router.navigate("/");
  expect(loader).toHaveBeenCalledTimes(3);
  await router.prefetch("/");
  const submission = router.submit("/page", new FormData());
  const fetcher = router.createFetcher();
  const independent = fetcher.submit("/fetcher", new FormData());
  expect(await router.prefetch("/")).toEqual({});
  page.resolve(Error("failed"));
  await submission;
  expect(await router.prefetch("/")).toEqual({});
  fetcherAction.resolve(Error("failed too"));
  await independent;
  await router.navigate("/");
  expect(loader).toHaveBeenCalledTimes(5);
  await router.prefetch("/");
  await router.navigate("/");
  expect(loader).toHaveBeenCalledTimes(6);
  router.dispose();
});

it("cannot use an invalidated in-flight read when a noncooperative loader resolves late", async () => {
  const gate = deferred<string>();
  let signal: AbortSignal | undefined;
  const loader = vi.fn(({ signal: requestSignal }) => {
    signal = requestSignal;
    return gate.promise;
  });
  const router = createDataRouter([
    { path: "/item", loader },
    { path: "/save", action: () => "saved" },
  ]);
  const prefetch = router.prefetch("/item");
  await expect.poll(() => loader.mock.calls.length).toBe(1);
  const navigation = router.navigate("/item");
  loader.mockReturnValue(Promise.resolve("new"));
  const fetcher = router.createFetcher();
  await fetcher.submit("/save", new FormData());
  expect(signal?.aborted).toBe(true);
  loader.mockReturnValue(Promise.resolve("new"));
  gate.resolve("old");
  await Promise.all([prefetch, navigation]);
  expect(router.getSnapshot().data).toBe("new");
  router.dispose();
});

it("lets the newest navigation consume an in-flight read without a second loader", async () => {
  const gate = deferred<string>();
  const loader = vi.fn(() => gate.promise);
  const router = createDataRouter([{ path: "/item", loader }]);
  const warm = router.prefetch("/item");
  const older = router.navigate("/item#old");
  const newer = router.navigate("/item#new");
  gate.resolve("ready");
  await Promise.all([warm, older, newer]);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(router.getSnapshot()).toMatchObject({
    data: "ready",
    url: "http://localhost/item#new",
  });
  router.dispose();
});

it("settles cancelled reads even when a loader ignores its signal", async () => {
  const gate = deferred<string>();
  const loader = vi.fn(() => gate.promise);
  const router = createDataRouter([{ path: "/item", loader }]);
  const pending = router.prefetch("/item");
  await expect.poll(() => loader.mock.calls.length).toBe(1);
  router.dispose();
  expect(await pending).toEqual({});
  gate.resolve("late");
  expect(router.getSnapshot().loaded).toBe(false);
});

it("does not invoke work cancelled before its scheduled loader starts", async () => {
  const loader = vi.fn();
  const router = createDataRouter([{ path: "/item", loader }]);
  const pending = router.prefetch("/item");
  router.dispose();
  await pending;
  expect(loader).not.toHaveBeenCalled();
});
