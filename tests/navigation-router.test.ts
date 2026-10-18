import { createRouter, defineRoute, type NavigationRoute } from "@smolter/core";
import { expect, expectTypeOf, it, vi } from "vitest";

it("matches immediately without starting a data engine", async () => {
  const router = createRouter([
    defineRoute("/", {}),
    defineRoute("/items/:id", {}),
  ]);
  const changed = vi.fn();
  const unsubscribe = router.subscribe(changed);
  const stop = router.start();
  expect(router.getSnapshot()).toMatchObject({
    path: "/",
    loaded: true,
    state: "idle",
  });
  expect(router).not.toHaveProperty("createFetcher");
  expect(router).not.toHaveProperty("submit");
  expect(router).not.toHaveProperty("revalidate");
  await router.navigate("/items/hello%20world?q=1#details");
  expect(router.getSnapshot()).toMatchObject({
    path: "/items/:id",
    params: { id: "hello world" },
    state: "idle",
  });
  expect(changed).toHaveBeenCalledTimes(1);
  const snapshot = router.getSnapshot();
  await router.navigate(snapshot.url);
  await router.navigate("https://elsewhere.example/items/2");
  expect(router.getSnapshot()).toBe(snapshot);
  expect(changed).toHaveBeenCalledTimes(1);
  unsubscribe();
  await router.navigate("/missing");
  expect(router.getSnapshot()).toMatchObject({ path: undefined, params: {} });
  expect(changed).toHaveBeenCalledTimes(1);
  stop();
  router.dispose();
});

it("isolates server URLs and rejects data routes at the type boundary", () => {
  const a = createRouter([defineRoute("/a", {})], {
    url: "https://example.test/a",
  });
  const b = createRouter([defineRoute("/b", {})], {
    url: "/b",
    browser: true,
  });
  expect(a.getSnapshot().path).toBe("/a");
  expect(b.getSnapshot().path).toBe("/b");
  expectTypeOf<NavigationRoute["loader"]>().toEqualTypeOf<undefined>();
  expectTypeOf<NavigationRoute["clientAction"]>().toEqualTypeOf<undefined>();
  a.dispose();
  b.dispose();
});
