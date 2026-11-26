/** @jsxImportSource preact */
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

import {
  connectNavigation,
  navigationStore,
  scrollPositions,
} from "@smolter/core/navigation";
import { retainRoute } from "@smolter/core/presentation";
import { data, normalizeResult, redirect } from "@smolter/core/responses";
import {
  Await,
  createDataRouter,
  Outlet,
  useActionData,
} from "@smolter/preact";
import { Document, Scripts } from "@smolter/preact/document";
import { lazyRoute } from "@smolter/preact/lazy-route";
import type { RootModule } from "@smolter/preact/route-types";
import { prepareRoutes } from "@smolter/preact/router";
import { dispatchRoute, renderApplication } from "@smolter/server/preact";
import { flushSync, Suspense } from "preact/compat";
import { renderToStringAsync } from "preact-render-to-string";

const root: RootModule = {
  default: () => <main>Application</main>,
  Layout: ({ children }) => (
    <Document>
      <head />
      <body>
        {children}
        <Scripts />
      </body>
    </Document>
  ),
};

test("SSR resolves deferred fields and safely serializes hydration data", async () => {
  const response = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => null,
        loader: () => ({
          count: Promise.resolve(3),
          title: "</script><script>bad</script>",
        }),
      },
    ],
    root,
    "/assets/client-hash.js",
  );
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toMatch(/"count":3/);
  expect(html).toMatch(/client-hash\.js/);
  expect(html).not.toMatch(/<script>bad/);
});

test("SSR and fetcher redirects retain cookies and their HTTP semantics", async () => {
  const routes = [
    {
      path: "/login",
      default: () => null,
      loader: () =>
        redirect("/done", {
          status: 303,
          headers: { "Set-Cookie": "test=1; HttpOnly; SameSite=Lax" },
        }),
    },
    { path: "/done", default: () => null },
  ];
  const request = new Request("http://local/login");
  const document = await renderApplication(request, routes, root, "/entry.js");
  const transport = await dispatchRoute(request, routes);
  expect(document.status).toBe(303);
  expect(document.headers.get("Location")).toBe("/done");
  expect(document.headers.get("Set-Cookie") ?? "").toMatch(/HttpOnly/);
  expect(transport.headers.get("X-Smolter-Redirect")).toBe("/done");
  expect(transport.headers.get("Set-Cookie") ?? "").toMatch(/HttpOnly/);
});

test("resource routes preserve literal paths, content types and response bodies", async () => {
  const response = await renderApplication(
    new Request("http://local/robots.txt"),
    [
      {
        path: "/robots-txt",
        routePath: "/robots.txt",
        loader: () =>
          new Response("User-agent: *", {
            headers: { "Content-Type": "text/plain" },
          }),
      },
    ],
    root,
    "/entry.js",
  );
  expect(response.headers.get("Content-Type")).toBe("text/plain");
  expect(await response.text()).toBe("User-agent: *");
});

test("route errors keep their status through SSR and browser transport", async () => {
  const routes = [
    {
      path: "/missing",
      default: () => null,
      loader: () => new Response("Missing", { status: 404 }),
    },
  ];
  const request = new Request("http://local/missing");
  const document = await renderApplication(request, routes, root, "/entry.js");
  const transport = await dispatchRoute(request, routes);
  const error = await normalizeResult(await transport.json());
  expect(document.status).toBe(404);
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty("status", 404);
});

test("PATCH invokes the matched action and preserves validation data", async () => {
  const body = new FormData();
  body.set("name", "updated");
  const response = await dispatchRoute(
    new Request("http://local/items/7", { method: "PATCH", body }),
    [
      {
        path: "/items/:id",
        action: async ({ request, params }) =>
          data(
            {
              id: params.id,
              method: request.method,
              name: (await request.formData()).get("name"),
            },
            { status: 422 },
          ),
      },
    ],
  );
  expect(await response.json()).toStrictEqual({
    id: "7",
    method: "PATCH",
    name: "updated",
  });
});

test("a newer navigation cancels the previous loader and wins", async () => {
  let aborted = false;
  let started: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const router = createDataRouter(
    prepareRoutes([
      {
        path: "/slow",
        loader: ({ signal }) =>
          new Promise((resolve) => {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                resolve("stale");
              },
              { once: true },
            );
            started();
          }),
      },
      { path: "/fast", loader: () => "fresh" },
    ]),
  );
  const slow = router.navigate("/slow");
  await ready;
  await router.navigate("/fast");
  await slow;
  expect(aborted).toBe(true);
  expect(router.getSnapshot().data).toBe("fresh");
  router.dispose();
});

test("fetcher reads remain independent and shouldRevalidate controls mutation reloads", async () => {
  let loads = 0;
  const router = createDataRouter(
    prepareRoutes([
      {
        path: "/",
        loader: () => ++loads,
        shouldRevalidate: ({ reason }) => reason !== "action",
      },
      {
        path: "/resource",
        loader: () => ({ count: 7 }),
        action: () => ({ saved: true }),
      },
    ]),
  );
  await router.navigate("/");
  const fetcher = router.createFetcher();
  await fetcher.load("/resource");
  expect(fetcher.getSnapshot().data).toStrictEqual({ count: 7 });
  expect(router.getSnapshot().data).toBe(1);
  await fetcher.submit("/resource", new FormData(), { method: "PATCH" });
  expect(loads).toBe(1);
  await router.revalidate();
  expect(loads).toBe(2);
  fetcher.dispose();
  router.dispose();
});

test("lazy routes load only the matched module and retain action/revalidation behavior", async () => {
  let imports = 0;
  let unrelatedImports = 0;
  let loads = 0;
  const routes = prepareRoutes([
    lazyRoute(
      { path: "/", clientAction: true, shouldRevalidate: true },
      async () => {
        imports++;
        return {
          clientLoader: () => ++loads,
          clientAction: () => ({ saved: true }),
          shouldRevalidate: ({ reason }) => reason !== "action",
        };
      },
    ),
    lazyRoute({ path: "/other" }, async () => {
      unrelatedImports++;
      return { clientLoader: () => "other" };
    }),
  ]);
  const router = createDataRouter(routes);
  expect(imports).toBe(0);
  await routes[0].preload?.();
  await router.navigate("/");
  await router.submit("/", new FormData());
  expect(imports).toBe(1);
  expect(unrelatedImports).toBe(0);
  expect(loads).toBe(1);
  expect(router.getSnapshot().actionData).toStrictEqual({ saved: true });
  await router.navigate("/other");
  expect(unrelatedImports).toBe(1);
  expect(router.getSnapshot().data).toBe("other");
  router.dispose();
});

test("cancelling a pending module prevents its data handler from starting", async () => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let loads = 0;
  const router = createDataRouter(
    prepareRoutes([
      lazyRoute({ path: "/slow" }, async () => {
        await pending;
        return { clientLoader: () => ++loads };
      }),
      { path: "/fast", loader: () => "fresh" },
    ]),
  );
  const slow = router.navigate("/slow");
  await router.navigate("/fast");
  release();
  await slow;
  expect(loads).toBe(0);
  expect(router.getSnapshot().data).toBe("fresh");
  router.dispose();
});

test("lazy client handlers retain their server callbacks", async (context) => {
  const methods: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    methods.push(init?.method ?? "GET");
    return Response.json({ count: 4 });
  });
  const router = createDataRouter(
    prepareRoutes([
      lazyRoute(
        { path: "/", loader: true, action: true, shouldRevalidate: true },
        async () => ({
          clientLoader: async ({ serverLoader }) => ({
            source: "client loader",
            server: await serverLoader(),
          }),
          clientAction: async ({ serverAction }) => ({
            source: "client action",
            server: await serverAction(),
          }),
          shouldRevalidate: () => false,
        }),
      ),
    ]),
  );
  await router.navigate("/");
  expect(router.getSnapshot().data).toStrictEqual({
    source: "client loader",
    server: { count: 4 },
  });
  await router.submit("/", new FormData(), { method: "PATCH" });
  expect(router.getSnapshot().actionData).toStrictEqual({
    source: "client action",
    server: { count: 4 },
  });
  expect(methods).toStrictEqual(["GET", "PATCH"]);
  router.dispose();
});

test("pending navigation retains the committed view and data until ready", async () => {
  let finish: (value: string) => void = () => {};
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const router = createDataRouter([
    { path: "/", loader: () => "home" },
    { path: "/room", loader: () => pending },
    { path: "/watch", loader: () => "watch" },
  ]);
  await router.navigate("/");
  retainRoute(router, flushSync);
  const room = router.navigate("/room");
  expect(router.getSnapshot().path).toBe("/");
  expect(router.getSnapshot().data).toBe("home");
  expect(router.getSnapshot().loaded).toBe(true);
  expect(router.getSnapshot().state).toBe("loading");
  await router.navigate("/watch");
  finish("stale room");
  await room;
  expect(router.getSnapshot().path).toBe("/watch");
  expect(router.getSnapshot().data).toBe("watch");
  expect(router.getSnapshot().state).toBe("idle");
  router.dispose();
});

test("completed navigation publishes the destination and data together", async () => {
  let finish: (value: string) => void = () => {};
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const router = createDataRouter([
    { path: "/", loader: () => "home" },
    { path: "/security", loader: () => pending },
  ]);
  await router.navigate("/");
  retainRoute(router, flushSync);
  const snapshots: string[] = [];
  router.subscribe(() =>
    snapshots.push(`${router.getSnapshot().path}:${router.getSnapshot().data}`),
  );
  const navigation = router.navigate("/security");
  finish("security");
  await navigation;
  expect(snapshots).toStrictEqual(["/:home", "/security:security"]);
  router.dispose();
});

test("consumer commit callbacks own presentation and cannot apply obsolete or repeated updates", async (context) => {
  const router = createDataRouter([
    { path: "/", loader: () => "home" },
    { path: "/watch", loader: () => "watch" },
    { path: "/music", loader: () => "music" },
  ]);
  await router.navigate("/");
  retainRoute(router, flushSync);
  const commits: (() => void)[] = [];
  const destinations: string[] = [];
  const handler: NonNullable<
    (typeof router.routes)[number]["viewTransition"]
  > = (commit, previous, next) => {
    expect(previous.data).toBe("home");
    destinations.push(new URL(next.url).pathname);
    commits.push(commit);
  };
  router.routes[1].viewTransition = handler;
  router.routes[2].viewTransition = handler;
  context.onTestFinished(() => router.dispose());
  await router.navigate("/watch");
  expect(router.getSnapshot().data).toBe("home");
  await router.navigate("/music");
  commits[0]();
  expect(router.getSnapshot().data).toBe("home");
  commits[1]();
  expect(router.getSnapshot().data).toBe("music");
  let notifications = 0;
  router.subscribe(() => notifications++);
  commits[1]();
  expect(notifications).toBe(0);
  expect(destinations).toStrictEqual(["/watch", "/music"]);
  router.routes[1].viewTransition = (commit) => commits.push(commit);
  await router.navigate("/watch");
  router.dispose();
  commits[2]();
  expect(router.getSnapshot().data).toBe("music");
});

test("hash navigation keeps loader data without another request", async () => {
  let loads = 0;
  const router = createDataRouter(
    prepareRoutes([{ path: "/security", loader: () => ++loads }]),
  );
  await router.navigate("/security");
  await router.navigate("/security#scope");
  expect(loads).toBe(1);
  expect(new URL(router.getSnapshot().url).hash).toBe("#scope");
  expect(router.getSnapshot().data).toBe(1);
  router.dispose();
});

test("history commits once after loading and captures the departing scroll position", async (context) => {
  const names = [
    "window",
    "history",
    "location",
    "addEventListener",
    "removeEventListener",
  ] as const;
  const originals = names.map((name) =>
    Object.getOwnPropertyDescriptor(globalThis, name),
  );
  const target = new EventTarget();
  const address = new URL("http://localhost/");
  let historyState: unknown = { key: "existing", state: { from: "reload" } };
  const browserHistory = {
    get state() {
      return historyState;
    },
    replaceState(state: unknown, _title: string, href: string) {
      historyState = state;
      address.href = new URL(href, address).href;
    },
    pushState(state: unknown, title: string, href: string) {
      this.replaceState(state, title, href);
    },
  };
  const browserWindow = {
    scrollX: 0,
    scrollY: 420,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  for (const [name, value] of [
    ["window", browserWindow],
    ["history", browserHistory],
    ["location", address],
    ["addEventListener", browserWindow.addEventListener],
    ["removeEventListener", browserWindow.removeEventListener],
  ] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  context.onTestFinished(() => {
    names.forEach((name, index) => {
      const descriptor = originals[index];
      if (descriptor)
        return Object.defineProperty(globalThis, name, descriptor);
      Reflect.deleteProperty(globalThis, name);
    });
  });
  let resolve = (_value: string) => {};
  const destination = new Promise<string>((done) => {
    resolve = done;
  });
  const router = createDataRouter(
    [
      { path: "/", loader: () => "home" },
      { path: "/guide", loader: () => destination },
    ],
    { browser: true },
  );
  await router.navigate("/");
  retainRoute(router, flushSync);
  connectNavigation(router);
  const store = navigationStore(router);
  let updates = 0;
  store.subscribe(() => {
    updates++;
    expect(browserHistory.state).toBe(store.getSnapshot());
  });
  const navigation = router.navigate("/guide");
  expect(store.getSnapshot().key).toBe("existing");
  expect(scrollPositions(router).get("existing")).toStrictEqual([0, 420]);
  expect(updates).toBe(0);
  resolve("guide");
  await navigation;
  expect(updates).toBe(1);
  expect(store.getSnapshot().type).toBe("PUSH");
  expect(router.getSnapshot().data).toBe("guide");
  router.dispose();
});

test("Await resolves deferred values before rendering children", async () => {
  let finish = (_value: number) => {};
  const deferred = new Promise<number>((resolve) => {
    finish = resolve;
  });
  const html = renderToStringAsync(
    <Suspense fallback={<p>Loading</p>}>
      <Await resolve={deferred}>
        {(value) => <output>{value + 1}</output>}
      </Await>
    </Suspense>,
  );
  finish(41);
  expect(await html).toMatch(/<output>42<\/output>/);
});

test("Await renders its error element for a rejected deferred field", async () => {
  const html = await renderToStringAsync(
    <Suspense fallback={<p>Loading</p>}>
      <Await
        resolve={Promise.reject(new Error("Unavailable"))}
        errorElement={<p>Temporarily unavailable</p>}
      >
        {() => <p>Unexpected success</p>}
      </Await>
    </Suspense>,
  );
  expect(html).toMatch(/Temporarily unavailable/);
  expect(html).not.toMatch(/Unexpected success/);
});

test("Await preserves resolved Error objects and empty values as data", async () => {
  for (const value of [new Error("resolved data"), undefined, null, false, 0]) {
    const html = await renderToStringAsync(
      <Suspense fallback={<p>Pending</p>}>
        <Await resolve={Promise.resolve(value)} errorElement="Rejected">
          {(data) => <output>{String(data)}</output>}
        </Await>
      </Suspense>,
    );
    expect(html).toMatch(new RegExp(`<output>${String(value)}</output>`));
    expect(html).not.toMatch(/Rejected/);
  }
});

test("Await propagates rejection when no local error element exists", async () => {
  const error = new Error("Deferred request failed");
  const html = renderToStringAsync(
    <Suspense fallback={<p>Loading</p>}>
      <Await resolve={Promise.reject(error)}>{() => <p>Ready</p>}</Await>
    </Suspense>,
  );
  await expect(Promise.resolve(html)).rejects.toThrow(error);
});

test("root revalidation only loads an explicitly configured route", async () => {
  const { attachRootData } = await import("@smolter/client/root-data");
  let loads = 0;
  const routes = [
    { path: "/mutation", action: () => ({ saved: true }) },
    { path: "/session", loader: () => ({ revision: ++loads }) },
  ];
  for (const configured of [false, true]) {
    const router = createDataRouter(routes);
    const store = attachRootData(
      router,
      { revision: 0 },
      {
        default: () => null,
        Layout: () => null,
        ...(configured && { loaderPath: "/session" }),
      },
    );
    const fetcher = router.createFetcher();
    await fetcher.submit("/mutation", new FormData());
    expect(store.getSnapshot()).toStrictEqual({ revision: configured ? 1 : 0 });
    expect(loads).toBe(configured ? 1 : 0);
    router.dispose();
  }
});

test("targeting root refreshes root data without refreshing the page", async () => {
  const { attachRootData } = await import("@smolter/client/root-data");
  let pageLoads = 0;
  let rootLoads = 0;
  const router = createDataRouter([
    { path: "/", loader: () => ++pageLoads },
    { path: "/session", loader: () => ++rootLoads },
  ]);
  const store = attachRootData(router, 0, {
    default: () => null,
    Layout: () => null,
    loaderPath: "/session",
  });
  await router.navigate("/");
  await router.revalidate({ route: "root" });
  expect(store.getSnapshot()).toBe(1);
  expect(pageLoads).toBe(1);
  router.dispose();
});

test("disposing during root refresh aborts work and leaves root data intact", async () => {
  const { attachRootData } = await import("@smolter/client/root-data");
  let finish!: (value: number) => void;
  let signal: AbortSignal | undefined;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const router = createDataRouter([
    {
      path: "/session",
      loader: (args) => {
        signal = args.signal;
        started();
        return new Promise<number>((resolve) => {
          finish = resolve;
        });
      },
    },
  ]);
  const store = attachRootData(router, 0, {
    default: () => null,
    Layout: () => null,
    loaderPath: "/session",
  });
  const pending = router.revalidate({ route: "root" });
  await ready;
  router.dispose();
  expect(signal?.aborted).toBe(true);
  finish(1);
  await pending;
  expect(store.getSnapshot()).toBe(0);
});

test("retries a failed lazy import and reuses the recovered module", async () => {
  const failure = new Error("Route chunk unavailable");
  let imports = 0;
  let loads = 0;
  const route = lazyRoute({ path: "/" }, () => {
    imports++;
    if (imports === 1) return Promise.reject(failure);
    return Promise.resolve({ clientLoader: () => ++loads });
  });
  const router = createDataRouter([route]);
  await router.navigate("/");
  expect(router.getSnapshot().error?.cause).toBe(failure);
  expect(loads).toBe(0);
  await router.navigate("/");
  expect(router.getSnapshot().error).toBe(undefined);
  expect(router.getSnapshot().data).toBe(1);
  expect(imports).toBe(2);
  await router.revalidate();
  expect(router.getSnapshot().data).toBe(2);
  expect(imports).toBe(2);
  router.dispose();
});

test("resolves lazy route metadata after its module is available", async () => {
  const route = lazyRoute({ path: "/people/:name", meta: true }, async () => ({
    meta: ({ params }) => [{ title: params.name }],
  }));
  const args = {
    data: undefined,
    loaderData: undefined,
    params: { name: "Ada" },
    location: new URL("https://example.test/people/Ada"),
  };
  expect(route.meta?.(args)).toStrictEqual([]);
  await route.preload?.();
  expect(route.meta?.(args)).toStrictEqual([{ title: "Ada" }]);
});

test("document resource mutations consume the request body and invoke the action once", async () => {
  let mutations = 0;
  let rootLoads = 0;
  const body = new FormData();
  body.set("name", "Ada");
  const response = await renderApplication(
    new Request("http://local/people/7", { method: "POST", body }),
    [
      {
        path: "/people/:id",
        action: async ({ request, params }) => {
          mutations++;
          const fields = await request.formData();
          return Response.json(
            { id: params.id, name: fields.get("name") },
            { status: 201, headers: { "X-Mutation": "created" } },
          );
        },
      },
    ],
    {
      ...root,
      loader: () => {
        rootLoads++;
        return {};
      },
    },
    "/entry.js",
  );
  expect(mutations).toBe(1);
  expect(rootLoads).toBe(0);
  expect(response.status).toBe(201);
  expect(response.headers.get("X-Mutation")).toBe("created");
  expect(await response.json()).toStrictEqual({ id: "7", name: "Ada" });
});

test("resource routes reject missing handlers instead of rendering a document", async () => {
  const response = await renderApplication(
    new Request("http://local/readonly", { method: "POST" }),
    [{ path: "/readonly", loader: () => ({ readable: true }) }],
    root,
    "/entry.js",
  );
  expect(response.status).toBe(405);
  expect(await response.json()).toStrictEqual({ error: "No handler" });
});

test("resource data responses preserve HTTP metadata while transport remains decodable", async () => {
  const routes = [
    {
      path: "/report",
      loader: () =>
        data(
          { ready: Promise.resolve(true) },
          {
            status: 202,
            statusText: "Accepted",
            headers: { "X-Report": "queued" },
          },
        ),
    },
  ];
  const request = new Request("http://local/report");
  const document = await renderApplication(request, routes, root, "/entry.js");
  const transport = await dispatchRoute(request, routes);
  expect(document.status).toBe(202);
  expect(document.statusText).toBe("Accepted");
  expect(document.headers.get("X-Report")).toBe("queued");
  expect(await document.json()).toStrictEqual({ ready: true });
  expect(transport.status).toBe(200);
  expect(transport.headers.get("X-Report")).toBe("queued");
  expect(await transport.json()).toStrictEqual({ ready: true });
});

test("document actions redirect once without loading the page", async () => {
  let actions = 0;
  let loads = 0;
  const response = await renderApplication(
    new Request("http://local/form", { method: "POST" }),
    [
      {
        path: "/form",
        default: () => null,
        loader: () => ++loads,
        action: () => {
          actions++;
          return redirect("/done", {
            status: 303,
            headers: { "Set-Cookie": "saved=1" },
          });
        },
      },
    ],
    root,
    "/entry.js",
  );
  expect(actions).toBe(1);
  expect(loads).toBe(0);
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe("/done");
  expect(response.headers.get("Set-Cookie")).toBe("saved=1");
});

test("data dispatch resolves plain values and transports rejected handler errors", async () => {
  const routes = [
    { path: "/plain", loader: () => ({ value: Promise.resolve(3) }) },
    { path: "/broken", loader: () => Promise.reject(Error("Handler failed")) },
  ];
  const plain = await dispatchRoute(new Request("http://local/plain"), routes);
  const broken = await dispatchRoute(
    new Request("http://local/broken"),
    routes,
  );
  const absent = await dispatchRoute(
    new Request("http://local/absent"),
    routes,
  );
  expect(await plain.json()).toStrictEqual({ value: 3 });
  const error = await normalizeResult(await broken.json());
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty("message", "Handler failed");
  expect(absent.status).toBe(404);
  expect(await absent.json()).toStrictEqual({ error: "No route" });
});

interface SavedActionData {
  saved: string;
}

function SavedAction() {
  const result = useActionData<SavedActionData>();
  return <output>{result?.saved}</output>;
}

test("page POST keeps its action result in the SSR hydration snapshot", async () => {
  let actions = 0;
  let loads = 0;
  const response = await renderApplication(
    new Request("http://local/save", { method: "POST", body: "name=hello" }),
    [
      {
        path: "/save",
        default: SavedAction,
        action: async ({ request }) => {
          actions += 1;
          return { saved: await request.text() };
        },
        loader: () => {
          loads += 1;
          return { count: actions };
        },
      },
    ],
    { ...root, default: Outlet },
    "/entry.js",
  );
  const html = await response.text();
  expect(actions).toBe(1);
  expect(loads).toBe(1);
  expect(response.status).toBe(200);
  expect(html).toMatch(/<output>name=hello<\/output>/);
  expect(html).toMatch(/"actionData":\{"saved":"name=hello"\}/);
  expect(html).toMatch(/"data":\{"count":1\}/);
});

test("page validation data retains its status and cookies in the HTML response", async () => {
  const response = await renderApplication(
    new Request("http://local/save", { method: "POST" }),
    [
      {
        path: "/save",
        default: () => null,
        action: () =>
          data(
            { field: "Name is required" },
            {
              status: 422,
              headers: { "Set-Cookie": "draft=1; HttpOnly" },
            },
          ),
      },
    ],
    root,
    "/entry.js",
  );
  expect(response.status).toBe(422);
  expect(response.headers.get("Set-Cookie")).toBe("draft=1; HttpOnly");
  expect(response.headers.get("Content-Type") ?? "").toMatch(/text\/html/);
  expect(await response.text()).toMatch(
    /"actionData":\{"field":"Name is required"\}/,
  );
});

test("page action errors are serialized for the route boundary", async () => {
  const response = await renderApplication(
    new Request("http://local/save", { method: "POST" }),
    [
      {
        path: "/save",
        default: () => null,
        action: () => Error("Cannot save"),
      },
    ],
    root,
    "/entry.js",
  );
  expect(response.status).toBe(500);
  expect(await response.text()).toMatch(/"message":"Cannot save"/);
});

test("page actions can return a non-JSON HTTP response directly", async () => {
  const response = await renderApplication(
    new Request("http://local/save", { method: "POST" }),
    [
      {
        path: "/save",
        default: () => null,
        action: () =>
          new Response("Exported", {
            headers: { "Content-Type": "text/plain" },
          }),
      },
    ],
    root,
    "/entry.js",
  );
  expect(response.headers.get("Content-Type")).toBe("text/plain");
  expect(await response.text()).toBe("Exported");
});

test("early hydration includes pending references and an async entry in the initial shell", async () => {
  const response = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => null,
        loader: () => ({ detail: Promise.resolve("ready") }),
      },
    ],
    root,
    "/entry.js",
    { earlyHydration: true, nonce: "test-nonce" },
  );
  const html = await response.text();
  expect(html).toMatch(/__smolterPending/);
  expect(html).toMatch(/type="module" async/);
  expect(html).toContain(JSON.stringify('[0,"ready",null]'));
  expect(html).toMatch(/nonce="test-nonce"/);
});

test("explicit Await fallback retains settled HTML with ordinary SSR", async () => {
  const response = await renderApplication(
    new Request("http://localhost/"),
    [
      {
        path: "/",
        default: () => (
          <Await
            resolve={Promise.resolve("Resolved SSR detail")}
            fallback={<p>Pending SSR detail</p>}
          >
            {(value) => <p>{value}</p>}
          </Await>
        ),
      },
    ],
    { ...root, default: Outlet },
    "/entry.js",
  );
  const html = await response.text();
  expect(html).toMatch(/Resolved SSR detail/);
});

test("Await renders resolved values without a pending boundary", async () => {
  const html = await renderToStringAsync(
    <Await resolve="ready" fallback="pending">
      {(value) => <p>{value}</p>}
    </Await>,
  );
  expect(html).toBe("<p>ready</p>");
});

test("renders Preact document content without an optional root module", async () => {
  const { RouterApplication } = await import("@smolter/preact");
  const routes = [{ path: "/", default: () => <main>Standalone route</main> }];
  const router = createDataRouter(routes);
  await router.navigate("/");
  const html = await renderToStringAsync(
    <RouterApplication
      router={router}
      routes={routes}
      root={undefined}
      document
    />,
  );
  router.dispose();
  expect(html).toMatch(/<main>Standalone route<\/main>/);
});

test("SSR preserves root and route response metadata without unsafe transport headers", async () => {
  const response = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => null,
        loader: () =>
          data(
            { page: true },
            {
              status: 201,
              headers: { "X-Page": "yes", "Content-Length": "999" },
            },
          ),
      },
    ],
    {
      ...root,
      loader: () =>
        data(
          { account: true },
          {
            headers: {
              "X-Root": "yes",
              "Set-Cookie": "session=fixture; HttpOnly",
            },
          },
        ),
    },
    "/entry.js",
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("X-Root")).toBe("yes");
  expect(response.headers.get("X-Page")).toBe("yes");
  expect(response.headers.get("Content-Length")).toBe(null);
  expect(response.headers.get("Set-Cookie") ?? "").toMatch(/HttpOnly/);
  await response.text();
  const missing = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => null,
        loader: () => {
          throw new Response("Missing", {
            status: 404,
            headers: { "X-Robots-Tag": "noindex" },
          });
        },
      },
    ],
    root,
    "/entry.js",
  );
  expect(missing.status).toBe(404);
  expect(missing.headers.get("X-Robots-Tag")).toBe("noindex");
  await missing.text();
});
