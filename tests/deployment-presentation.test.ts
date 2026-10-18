import { createDataRouter } from "@smolter/core";
import { retainRoute } from "@smolter/core/presentation";
import { afterEach, expect, it, vi } from "vitest";
import { watchDeployment } from "../packages/client/src/deployment.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function fixture(custom = false, duplicate = false) {
  const events = new EventTarget();
  const assign = vi.fn();
  const reload = vi.fn();
  vi.stubGlobal("window", events);
  vi.stubGlobal("location", {
    href: "https://app.test/",
    origin: "https://app.test",
    assign,
  });
  const markers = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => markers.get(key),
    setItem: (key: string, value: string) => markers.set(key, value),
  });
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const router = createDataRouter(
    [
      { path: "/", loader: () => "Home" },
      {
        path: "/broken",
        loader: () => {
          events.dispatchEvent(new Event("vite:preloadError"));
          if (duplicate) events.dispatchEvent(new Event("vite:preloadError"));
          return Promise.reject(new TypeError("Missing chunk"));
        },
      },
      { path: "/next", loader: () => "Next" },
      { path: "/ordinary-error", loader: () => new Error("Ordinary failure") },
    ],
    { url: "https://app.test/" },
  );
  const cleanup = watchDeployment(router, {
    version: "old",
    manifestURL: "/manifest.json",
    ...(custom && { reload }),
  });
  retainRoute(router, (commit) => commit());
  cleanups.push(() => router.dispose());
  return {
    router,
    assign,
    reload,
    cleanup,
    finish: (response: Response) => {
      vi.mocked(fetch).mockResolvedValue(response.clone());
      finish(response);
    },
  };
}
for (const outcome of [
  "new",
  "old",
  "failed",
  "custom",
  "navigation",
  "cleanup",
]) {
  it(`retains the usable route during chunk confirmation and resolves ${outcome}`, async () => {
    const { router, assign, reload, cleanup, finish } = fixture(
      outcome === "custom",
    );
    await router.navigate("/");
    await router.navigate("/broken?tab=1#details");
    expect(router.getSnapshot().data).toBe("Home");
    expect(router.getSnapshot().error).toBeUndefined();
    expect(router.getSnapshot().state).toBe("loading");
    if (outcome === "navigation") await router.navigate("/next");
    if (outcome === "cleanup") cleanup();
    finish(
      outcome === "failed"
        ? new Response(null, { status: 503 })
        : Response.json({ version: outcome === "old" ? "old" : "new" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (outcome === "new") {
      expect(assign).toHaveBeenCalledExactlyOnceWith(
        "https://app.test/broken?tab=1#details",
      );
      expect(router.getSnapshot().data).toBe("Home");
      expect(router.getSnapshot().error).toBeUndefined();
    } else if (outcome === "navigation") {
      expect(assign).not.toHaveBeenCalled();
      expect(router.getSnapshot().data).toBe("Next");
    } else {
      expect(router.getSnapshot().error?.message).toContain("Missing chunk");
      expect(router.getSnapshot().state).toBe("idle");
      expect(assign).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(outcome === "custom" ? 1 : 0);
    }
  });
}

it("does not delay an ordinary loader error behind a manifest request", async () => {
  const { router } = fixture();
  await router.navigate("/");
  await router.navigate("/ordinary-error");
  expect(router.getSnapshot().error?.message).toBe("Ordinary failure");
});
it("releases the real error when recovery storage is unavailable", async () => {
  const { router, finish, assign } = fixture();
  vi.stubGlobal("sessionStorage", { getItem: () => "1" });
  await router.navigate("/");
  await router.navigate("/broken");
  finish(Response.json({ version: "new" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(router.getSnapshot().error?.message).toContain("Missing chunk");
  expect(assign).not.toHaveBeenCalled();
});
it("bounds error retention by the existing manifest request timeout", async () => {
  vi.useFakeTimers();
  const { router, assign } = fixture();
  vi.mocked(fetch).mockImplementation(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("Timed out")),
          { once: true },
        );
      }),
  );
  await router.navigate("/");
  await router.navigate("/broken");
  expect(router.getSnapshot().error).toBeUndefined();
  await vi.advanceTimersByTimeAsync(4001);
  expect(router.getSnapshot().error?.message).toContain("Missing chunk");
  expect(assign).not.toHaveBeenCalled();
});

it("keeps the retained view through duplicate failures for one destination", async () => {
  const { router, finish, assign } = fixture(false, true);
  await router.navigate("/");
  await router.navigate("/broken");
  finish(Response.json({ version: "new" }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(assign).toHaveBeenCalledOnce();
  expect(router.getSnapshot().error).toBeUndefined();
  expect(router.getSnapshot().data).toBe("Home");
});
