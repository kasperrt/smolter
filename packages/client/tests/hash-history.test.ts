import { createDataRouter } from "@smolter/core";
import { afterEach, expect, it, vi } from "vitest";
import { connectHashHistory, hashURL } from "../src/hash-history.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("resolves valid hash fragments on the current origin and falls back to root on unsafe values", () => {
  expect(hashURL("#/tasks/42?sort=asc#top", "https://app.example").href).toBe(
    "https://app.example/tasks/42?sort=asc#top",
  );
  expect(hashURL("", "https://app.example").href).toBe("https://app.example/");
  for (const unsafe of [
    "#//evil.example/admin",
    "#/\\evil.example",
    "#https://evil.example/admin",
    "#/a\nb",
  ])
    expect(hashURL(unsafe, "https://app.example").href).toBe(
      "https://app.example/",
    );
});

it("does not mutate browser history for external, unsafe, or malformed URLs", async () => {
  const locationState = { origin: "https://app.example", hash: "#/" };
  const pushState = vi.fn((_state: unknown, _title: string, url: string) => {
    locationState.hash = url;
  });
  const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
    locationState.hash = url;
  });
  const listeners = new Map<string, () => void>();
  vi.stubGlobal("location", locationState);
  vi.stubGlobal("history", { state: null, pushState, replaceState });
  vi.stubGlobal("window", {
    addEventListener: (event: string, listener: () => void) =>
      listeners.set(event, listener),
    removeEventListener: (event: string) => listeners.delete(event),
  });
  const router = createDataRouter(
    [
      { path: "/", loader: () => "home" },
      { path: "/tasks", loader: () => "tasks" },
      {
        path: "/redirect",
        loader: () =>
          new Response(null, { status: 302, headers: { Location: "/tasks" } }),
      },
    ],
    { url: "https://app.example/" },
  );
  connectHashHistory(router);
  await router.navigate("/tasks");
  expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "#/tasks");
  for (const rejected of [
    "https://evil.example/admin",
    "javascript:alert(1)",
    "http://[invalid",
  ]) {
    await router.navigate(rejected);
  }
  expect(pushState).toHaveBeenCalledTimes(1);
  expect(replaceState).not.toHaveBeenCalled();
  expect(locationState.hash).toBe("#/tasks");
  await router.navigate("/redirect", { replace: true });
  expect(replaceState).toHaveBeenCalledWith(null, "", "#/redirect");
  expect(replaceState).toHaveBeenLastCalledWith(null, "", "#/tasks");
  locationState.hash = "#/";
  listeners.get("hashchange")?.();
  await Promise.resolve();
  router.dispose();
  expect(listeners.size).toBe(0);
});
