import { createRouter, type DataArgs } from "@smolter/core";
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
  router.getSnapshot().state = "loading";
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
  router.getSnapshot().state = "loading";
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

it("leaves intent-prefetch failures idle until a click records its destination", async () => {
  const { router, events, fetcher, reload, storage } = setup("new");

  events.dispatchEvent(new Event("vite:preloadError"));
  await Promise.resolve();

  expect(fetcher).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);

  await router.navigate("/next?security#settings");

  expect(reload).toHaveBeenCalledOnce();
  expect(reload.mock.calls[0][0].href).toBe(
    "https://app.test/next?security#settings",
  );
});

it("preserves the newest click after prefetch failure and overlapping navigation", async () => {
  const { router, events, fetcher, reload } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );

  events.dispatchEvent(new Event("vite:preloadError"));
  const first = router.navigate("/first");
  router.getSnapshot().state = "loading";
  events.dispatchEvent(new Event("vite:preloadError"));
  const last = router.navigate("/next");

  resolve(Response.json({ version: "new" }));
  await Promise.all([first, last]);

  expect(fetcher).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(reload.mock.calls[0][0].pathname).toBe("/next");
});

it("cancels a pending Back check when Forward returns to the current route", async () => {
  const { events, location, fetcher, reload, storage } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );

  location.href = "https://app.test/previous";
  events.dispatchEvent(new PopStateEvent("popstate", { state: "back" }));
  location.href = "https://app.test/#returned";
  events.dispatchEvent(new PopStateEvent("popstate", { state: "forward" }));
  resolve(Response.json({ version: "new" }));
  await new Promise((done) => setTimeout(done, 0));

  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it("does not reload when a mutation starts while chunk recovery is checking", async () => {
  const { router, events, fetcher, reload, storage } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  router.getSnapshot().state = "loading";
  events.dispatchEvent(new Event("vite:preloadError"));
  router.getSnapshot().state = "submitting";
  resolve(Response.json({ version: "new" }));
  await new Promise((done) => setTimeout(done, 0));

  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it("recovers the committed action redirect destination without replaying its mutation", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { events, options, reload } = setup("new");
  const action = vi.fn(
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "/next?from=login#account" },
      }),
  );
  const router = createDataRouter(
    [
      { path: "/", action },
      {
        path: "/next",
        loader: () => {
          events.dispatchEvent(new Event("vite:preloadError"));
          return new Error("Missing destination chunk");
        },
      },
    ],
    { url: "https://app.test/" },
  );
  const rootRefresh = vi.fn(async () => undefined);
  router.registerRevalidator("root", rootRefresh);
  cleanups.push(watchDeployment(router, options));

  await router.submit("/", new FormData());
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

  expect(reload.mock.calls[0][0].href).toBe(
    "https://app.test/next?from=login#account",
  );
  expect(action).toHaveBeenCalledOnce();
  expect(rootRefresh).toHaveBeenCalledOnce();
});

it("invalidates pending recovery even when a newer mutation finishes before the manifest", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, events, fetcher, reload, storage } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const action = vi.fn(() => ({ saved: true }));
  const router = createDataRouter([{ path: "/", action }], {
    url: "https://app.test/",
  });
  cleanups.push(watchDeployment(router, options));
  router.getSnapshot().state = "loading";
  events.dispatchEvent(new Event("vite:preloadError"));

  await router.submit("/", new FormData());
  resolve(Response.json({ version: "new" }));
  await new Promise((done) => setTimeout(done, 0));

  expect(action).toHaveBeenCalledOnce();
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it("uses the latest overlapping history destination including its query and hash", async () => {
  const { events, location, fetcher, reload } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );

  location.href = "https://app.test/previous";
  events.dispatchEvent(new PopStateEvent("popstate", { state: 1 }));
  location.href = "https://app.test/next?tab=2#latest";
  events.dispatchEvent(new PopStateEvent("popstate", { state: 2 }));
  resolve(Response.json({ version: "new" }));

  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(reload.mock.calls[0][0].href).toBe(location.href);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("does not reload an older chunk failure after independent fetcher mutations", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, events, fetcher, reload, storage } = setup();
  let resolve!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const action = vi.fn(() => ({ saved: true }));
  const router = createDataRouter([{ path: "/", action }], {
    url: "https://app.test/",
  });
  cleanups.push(watchDeployment(router, options));
  router.getSnapshot().state = "loading";
  events.dispatchEvent(new Event("vite:preloadError"));
  const first = router.createFetcher();
  const second = router.createFetcher();

  await Promise.all([
    first.submit("/", new FormData()),
    second.submit("/", new FormData()),
  ]);
  resolve(Response.json({ version: "new" }));
  await new Promise((done) => setTimeout(done, 0));

  expect(action).toHaveBeenCalledTimes(2);
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

it("keeps navigation usable without reloading while either fetcher mutation is pending", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, reload, storage } = setup("new");
  const finishes: (() => void)[] = [];
  const action = vi.fn(() => new Promise<void>((done) => finishes.push(done)));
  const router = createDataRouter([{ path: "/", action }, { path: "/next" }], {
    url: "https://app.test/",
  });
  const original = router.createFetcher;
  const cleanup = watchDeployment(router, options);
  cleanups.push(cleanup);
  const first = router.createFetcher();
  const second = router.createFetcher();
  const submissions = [
    first.submit("/", new FormData()),
    second.submit("/", new FormData()),
  ];
  await vi.waitFor(() => expect(finishes).toHaveLength(2));
  finishes[0]();
  await submissions[0];
  await router.navigate("/next?pending=1#details");

  expect(router.getSnapshot().url).toBe(
    "https://app.test/next?pending=1#details",
  );
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);

  finishes[1]();
  await submissions[1];
  await router.navigate("/next?ready=1#details");

  expect(action).toHaveBeenCalledTimes(2);
  expect(reload).toHaveBeenCalledOnce();
  expect(reload.mock.calls[0][0].href).toBe(
    "https://app.test/next?ready=1#details",
  );
  cleanup();
  expect(router.createFetcher).toBe(original);
});

it("does not recover a new navigation while a page mutation remains pending", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, reload, storage } = setup("new");
  let finish!: () => void;
  const action = vi.fn(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const router = createDataRouter([{ path: "/", action }, { path: "/next" }], {
    url: "https://app.test/",
  });
  cleanups.push(watchDeployment(router, options));
  const submitted = router.submit("/", new FormData());
  await vi.waitFor(() => expect(action).toHaveBeenCalledOnce());
  await router.navigate("/next?pending=1#scope");

  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);

  finish();
  await submitted;
  expect(action).toHaveBeenCalledOnce();
});

it("invalidates an older recovery probe across overlapping page and fetcher submissions", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, events, fetcher, reload, storage } = setup();
  let manifest!: (response: Response) => void;
  fetcher.mockReturnValue(
    new Promise<Response>((done) => {
      manifest = done;
    }),
  );
  const action = vi.fn(() => ({ saved: true }));
  const router = createDataRouter([{ path: "/", action }], {
    url: "https://app.test/",
  });
  cleanups.push(watchDeployment(router, options));
  router.getSnapshot().state = "loading";
  events.dispatchEvent(new Event("vite:preloadError"));
  await Promise.all([
    router.submit("/", new FormData()),
    router.createFetcher().submit("/", new FormData()),
  ]);
  manifest(Response.json({ version: "new" }));
  await new Promise((done) => setTimeout(done, 0));

  expect(action).toHaveBeenCalledTimes(2);
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
});

for (const ending of ["failure", "abort", "dispose"] as const) {
  it(`keeps recovery blocked when one fetcher ends by ${ending} and another remains pending`, async () => {
    const { createDataRouter } = await import("@smolter/core");
    const { options, reload, storage } = setup("new");
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const action = vi.fn(
      ({ signal }: DataArgs) =>
        new Promise<void>((resolve, reject) => {
          fail = reject;
          signal.addEventListener("abort", () => reject(new Error("Aborted")), {
            once: true,
          });
        }),
    );
    const otherAction = vi.fn(
      () =>
        new Promise<void>((done) => {
          finish = done;
        }),
    );
    const router = createDataRouter(
      [
        { path: "/" },
        { path: "/first", action },
        { path: "/second", action: otherAction },
        { path: "/next" },
      ],
      { url: "https://app.test/" },
    );
    cleanups.push(watchDeployment(router, options));
    const first = router.createFetcher();
    const second = router.createFetcher();
    const firstPending = first.submit("/first", new FormData());
    const secondPending = second.submit("/second", new FormData());
    await vi.waitFor(() => expect(otherAction).toHaveBeenCalledOnce());

    if (ending === "failure") fail(new Error("Action failed"));
    if (ending === "dispose") first.dispose();
    if (ending === "abort") await first.load("/next");
    const failed = await firstPending;
    if (ending === "failure")
      expect(failed.error?.message).toContain("Action failed");
    await router.navigate("/next?pending=1#scope");
    expect(reload).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
    finish();
    await secondPending;
    await router.navigate("/next?ready=1#scope");
    expect(reload).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledOnce();
    expect(otherAction).toHaveBeenCalledOnce();
  });
}

it("restores methods before watcher reinstallation and ignores the disposed probe", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, fetcher, reload, storage } = setup();
  let manifest!: (response: Response) => void;
  fetcher.mockReturnValueOnce(
    new Promise<Response>((done) => {
      manifest = done;
    }),
  );
  const router = createDataRouter([{ path: "/" }, { path: "/next" }], {
    url: "https://app.test/",
  });
  const original = {
    navigate: router.navigate,
    submit: router.submit,
    createFetcher: router.createFetcher,
    dispose: router.dispose,
  };
  const stop = watchDeployment(router, options);
  const pending = router.navigate("/next?old=1");
  stop();
  for (const name of [
    "navigate",
    "submit",
    "createFetcher",
    "dispose",
  ] as const)
    expect(router[name]).toBe(original[name]);
  cleanups.push(watchDeployment(router, options));
  manifest(Response.json({ version: "new" }));
  await pending;
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
  await router.navigate("/next?current=1#scope");
  expect(router.getSnapshot().url).toBe(
    "https://app.test/next?current=1#scope",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("replaces a watcher without stacking methods or letting old cleanup restore stale wrappers", async () => {
  const { router, options, fetcher, reload, storage } = setup();
  const stopOld = cleanups.pop()!;
  const stopNew = watchDeployment(router, options);
  cleanups.push(stopNew);
  const current = router.navigate;
  stopOld();
  expect(router.navigate).toBe(current);
  await router.navigate("/next?current=1#scope");
  expect(router.getSnapshot().url).toBe(
    "https://app.test/next?current=1#scope",
  );
  expect(fetcher).toHaveBeenCalledOnce();
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
  stopNew();
  await router.navigate("/?restored=1");
  expect(router.getSnapshot().url).toBe("https://app.test/?restored=1");
  expect(fetcher).toHaveBeenCalledOnce();
});

it("preserves pending mutation protection and navigation ownership across watcher replacement", async () => {
  const { createDataRouter } = await import("@smolter/core");
  const { options, reload, storage } = setup("new");
  let finish!: () => void;
  const action = vi.fn(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  const router = createDataRouter([{ path: "/", action }, { path: "/next" }], {
    url: "https://app.test/",
  });
  const old = watchDeployment(router, options);
  const fetcher = router.createFetcher();
  const pending = fetcher.submit("/", new FormData());
  const current = watchDeployment(router, options);
  cleanups.push(current);
  const navigation = router.navigate("/next?protected=1#scope");
  old();
  await navigation;
  expect(router.getSnapshot().url).toBe(
    "https://app.test/next?protected=1#scope",
  );
  expect(reload).not.toHaveBeenCalled();
  expect(storage.size).toBe(0);
  finish();
  await pending;
  expect(action).toHaveBeenCalledOnce();
  await router.navigate("/next?eligible=1#scope");
  expect(reload).toHaveBeenCalledOnce();
  expect(storage.size).toBe(1);
});
