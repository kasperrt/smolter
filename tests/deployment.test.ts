import { createRouter } from "@smolter/core";
import { afterEach, expect, it, vi } from "vitest";
import { watchDeployment } from "../packages/client/src/deployment.ts";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();

  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(version = "old") {
  const events = new EventTarget();
  const storage = new Map<string, string>();
  const location = {
    href: "https://app.test/",
    origin: "https://app.test",
    assign: vi.fn(),
    reload: vi.fn(),
  };
  const router = createRouter([{ path: "/" }, { path: "/next" }], {
    url: location.href,
  });
  const fetcher = vi.fn(async (_url?: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ version }),
  );
  const reload = vi.fn<(destination: URL) => void>();

  vi.stubGlobal("window", events);
  vi.stubGlobal("location", location);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal(
    "PopStateEvent",
    class extends Event {
      state: unknown;
      constructor(type: string, options: PopStateEventInit) {
        super(type);
        this.state = options.state;
      }
    },
  );
  const options = {
    version: "old",
    manifestURL: "/smolter-manifest.json",
    reload,
  };
  cleanups.push(watchDeployment(router, options));

  return { router, fetcher, reload, events, location, options, storage };
}

it("is inert without build metadata or a browser", () => {
  const router = createRouter([]);
  watchDeployment(router, null)();
  watchDeployment(router, { version: "x", manifestURL: "/manifest" })();
});

it("checks navigations without caching and skips hash-only or external targets", async () => {
  const { router, fetcher, reload } = setup();
  await router.navigate("/#section");
  await router.navigate("https://elsewhere.test/");
  expect(fetcher).not.toHaveBeenCalled();
  await router.navigate("/next?tab=1#heading");
  expect(router.getSnapshot().url).toBe("https://app.test/next?tab=1#heading");
  expect(fetcher.mock.calls[0]).toEqual([
    new URL("https://app.test/smolter-manifest.json"),
    expect.objectContaining({ cache: "no-store" }),
  ]);
  expect(reload).not.toHaveBeenCalled();
});

it("reloads the intended destination once per old build, then permits ordinary errors", async () => {
  const { router, reload, storage } = setup("new");
  await router.navigate("/next?tab=1#heading");
  expect(reload.mock.calls[0][0].href).toBe(
    "https://app.test/next?tab=1#heading",
  );
  expect(router.getSnapshot().url).toBe("https://app.test/");
  expect(storage.size).toBe(1);
  await router.navigate("/next");
  expect(reload).toHaveBeenCalledTimes(1);
  expect(router.getSnapshot().url).toBe("https://app.test/next");
});

it("uses document navigation by default and avoids loops when storage is unavailable", async () => {
  const { router, location, options } = setup("new");
  router.dispose();
  cleanups.push(watchDeployment(router, { ...options, reload: undefined }));
  await router.navigate("/next");
  expect(location.assign).toHaveBeenCalledWith("https://app.test/next");
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw new Error("blocked");
    },
  });
  await router.navigate("/next?again");
  expect(location.assign).toHaveBeenCalledTimes(1);
  expect(router.getSnapshot().url).toContain("?again");
});

it.each([null, {}, { version: 3 }, { version: "" }])(
  "ignores malformed manifests: %j",
  async (body) => {
    const { router, fetcher, reload } = setup();
    fetcher.mockImplementation(async () => Response.json(body));
    await router.navigate("/next");
    expect(reload).not.toHaveBeenCalled();
  },
);

it("continues after unavailable, invalid JSON and offline responses", async () => {
  const { router, fetcher, reload } = setup();
  fetcher.mockImplementationOnce(
    async () => new Response("missing", { status: 404 }),
  );
  await router.navigate("/next");
  fetcher.mockImplementationOnce(async () => new Response("not json"));
  await router.navigate("/");
  fetcher.mockRejectedValueOnce(new Error("offline"));
  await router.navigate("/next");
  expect(reload).not.toHaveBeenCalled();
});

it("shares concurrent probes and only the newest navigation may reload", async () => {
  const { router, fetcher, reload } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const first = router.navigate("/first");
  const last = router.navigate("/next");
  resolve(Response.json({ version: "new" }));
  await Promise.all([first, last]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(reload.mock.calls[0][0].pathname).toBe("/next");
});

it("cleans up listeners and ignores in-flight checks after disposal", async () => {
  const { router, fetcher, reload, events } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const pending = router.navigate("/next");
  router.dispose();
  resolve(Response.json({ version: "new" }));
  await pending;
  events.dispatchEvent(new Event("vite:preloadError"));
  expect(reload).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("recovers chunk failures only after a confirmed deployment and never during a submission", async () => {
  const { router, fetcher, reload, events } = setup("new");
  router.getSnapshot().state = "submitting";
  events.dispatchEvent(new Event("vite:preloadError"));
  expect(fetcher).not.toHaveBeenCalled();
  router.getSnapshot().state = "idle";
  events.dispatchEvent(new Event("vite:preloadError"));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

it("replays unchanged back/forward events with their state and reloads changed builds", async () => {
  const { fetcher, events, location, reload } = setup();
  const listener = vi.fn();
  events.addEventListener("popstate", listener);
  location.href = "https://app.test/#anchor";
  events.dispatchEvent(new PopStateEvent("popstate", { state: "hash" }));
  expect(fetcher).not.toHaveBeenCalled();
  location.href = "https://app.test/next";
  events.dispatchEvent(new PopStateEvent("popstate", { state: "back" }));
  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
  expect(listener.mock.calls[1][0].state).toBe("back");
  fetcher.mockImplementation(async () => Response.json({ version: "new" }));
  events.dispatchEvent(new PopStateEvent("popstate", { state: "next" }));
  await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

it("times out without preventing navigation", async () => {
  const { router, fetcher, reload } = setup();
  fetcher.mockImplementation(
    (_url?: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("timeout")),
        );
      }),
  );
  vi.useFakeTimers();
  const navigation = router.navigate("/next");
  await vi.advanceTimersByTimeAsync(2000);
  await navigation;
  expect(reload).not.toHaveBeenCalled();
  expect(router.getSnapshot().url).toBe("https://app.test/next");
});

it("reloads the document when a failed chunk has already committed its URL", async () => {
  const { router, location, options, events } = setup("new");
  router.dispose();
  cleanups.push(watchDeployment(router, { ...options, reload: undefined }));
  events.dispatchEvent(new Event("vite:preloadError"));
  await vi.waitFor(() => expect(location.reload).toHaveBeenCalledTimes(1));
});

it("recovers bootstrap failures before mounting and shares the reload-loop safeguard", async () => {
  const { recoverDeployment } = await import(
    "../packages/client/src/deployment.ts"
  );
  expect(await recoverDeployment(null)).toBe(false);
  expect(
    await recoverDeployment({ version: "old", manifestURL: "/manifest" }),
  ).toBe(false);
  const { options, reload, fetcher } = setup("new");
  expect(await recoverDeployment(options)).toBe(true);
  expect(reload).toHaveBeenCalledOnce();
  expect(
    await recoverDeployment(options, new URL("https://app.test/next")),
  ).toBe(false);
  fetcher.mockResolvedValue(Response.json({ version: "old" }));
  expect(await recoverDeployment(options)).toBe(false);
});
