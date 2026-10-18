/** @jsxImportSource preact */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

import { createDataRouter, Outlet, useActionData } from "@smolter/preact";
import { flushSync, Suspense } from "preact/compat";
import { renderToStringAsync } from "preact-render-to-string";
import {
  connectNavigation,
  navigationStore,
  scrollPositions,
} from "../packages/core/src/navigation.ts";
import { retainRoute } from "../packages/core/src/presentation.ts";
import {
  data,
  normalizeResult,
  redirect,
} from "../packages/core/src/responses.ts";
import { Await } from "../packages/preact/src/await.tsx";
import { Document, Scripts } from "../packages/preact/src/document.tsx";
import { lazyRoute } from "../packages/preact/src/lazy-route.ts";
import type { RootModule } from "../packages/preact/src/route-types.ts";
import { prepareRoutes } from "../packages/preact/src/router.tsx";
import {
  dispatchRoute,
  renderApplication,
} from "../packages/server/src/application.tsx";

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
  assert.equal(response.status, 200);
  assert.match(html, /"count":3/);
  assert.match(html, /client-hash\.js/);
  assert.doesNotMatch(html, /<script>bad/);
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
  assert.equal(document.status, 303);
  assert.equal(document.headers.get("Location"), "/done");
  assert.match(document.headers.get("Set-Cookie") ?? "", /HttpOnly/);
  assert.equal(transport.headers.get("X-Smolter-Redirect"), "/done");
  assert.match(transport.headers.get("Set-Cookie") ?? "", /HttpOnly/);
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
  assert.equal(response.headers.get("Content-Type"), "text/plain");
  assert.equal(await response.text(), "User-agent: *");
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
  assert.equal(document.status, 404);
  assert.ok(error instanceof Error);
  assert.equal((error as Error & { status: number }).status, 404);
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
  assert.deepEqual(await response.json(), {
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
  assert.equal(aborted, true);
  assert.equal(router.getSnapshot().data, "fresh");
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
  assert.deepEqual(fetcher.getSnapshot().data, { count: 7 });
  assert.equal(router.getSnapshot().data, 1);
  await fetcher.submit("/resource", new FormData(), { method: "PATCH" });
  assert.equal(loads, 1);
  await router.revalidate();
  assert.equal(loads, 2);
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
  assert.equal(imports, 0);
  await routes[0].preload?.();
  await router.navigate("/");
  await router.submit("/", new FormData());
  assert.equal(imports, 1);
  assert.equal(unrelatedImports, 0);
  assert.equal(loads, 1);
  assert.deepEqual(router.getSnapshot().actionData, { saved: true });
  await router.navigate("/other");
  assert.equal(unrelatedImports, 1);
  assert.equal(router.getSnapshot().data, "other");
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
  assert.equal(loads, 0);
  assert.equal(router.getSnapshot().data, "fresh");
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
  assert.deepEqual(router.getSnapshot().data, {
    source: "client loader",
    server: { count: 4 },
  });
  await router.submit("/", new FormData(), { method: "PATCH" });
  assert.deepEqual(router.getSnapshot().actionData, {
    source: "client action",
    server: { count: 4 },
  });
  assert.deepEqual(methods, ["GET", "PATCH"]);
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
  assert.equal(router.getSnapshot().path, "/");
  assert.equal(router.getSnapshot().data, "home");
  assert.equal(router.getSnapshot().loaded, true);
  assert.equal(router.getSnapshot().state, "loading");
  await router.navigate("/watch");
  finish("stale room");
  await room;
  assert.equal(router.getSnapshot().path, "/watch");
  assert.equal(router.getSnapshot().data, "watch");
  assert.equal(router.getSnapshot().state, "idle");
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
  assert.deepEqual(snapshots, ["/:home", "/security:security"]);
  router.dispose();
});

test("view transitions snapshot the old page and commit the ready destination", async (context) => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const originalMatchMedia = Object.getOwnPropertyDescriptor(
    globalThis,
    "matchMedia",
  );
  let update = () => {};
  let transitions = 0;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      startViewTransition(callback: () => void) {
        transitions++;
        update = callback;
        return { ready: Promise.resolve() };
      },
    },
  });
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false }),
  });
  context.onTestFinished(() => {
    for (const [name, descriptor] of [
      ["document", originalDocument],
      ["matchMedia", originalMatchMedia],
    ] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const SharedView = () => null;
  const router = createDataRouter([
    { path: "/", loader: () => "home" },
    { path: "/watch", loader: () => "watch", default: SharedView },
    { path: "/music", loader: () => "music", default: SharedView },
  ]);
  await router.navigate("/");
  retainRoute(router, flushSync);
  await router.navigate("/watch", {
    viewTransition: true,
  } as import("../packages/preact/src/navigation.tsx").NavigateOptions);
  assert.equal(transitions, 1);
  assert.equal(router.getSnapshot().data, "home");
  update();
  assert.equal(router.getSnapshot().data, "watch");
  await router.navigate("/watch#details", {
    viewTransition: true,
  } as import("../packages/preact/src/navigation.tsx").NavigateOptions);
  assert.equal(transitions, 1);
  await router.navigate("/");
  assert.equal(transitions, 2);
  update();
  assert.equal(router.getSnapshot().data, "home");
  await router.navigate("/watch", {
    viewTransition: false,
  } as import("../packages/preact/src/navigation.tsx").NavigateOptions);
  assert.equal(transitions, 2);
  assert.equal(router.getSnapshot().data, "watch");
  await router.navigate("/music");
  assert.equal(transitions, 2);
  assert.equal(router.getSnapshot().data, "music");
  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  await router.navigate("/");
  assert.equal(transitions, 2);
  assert.equal(router.getSnapshot().data, "home");
  router.dispose();
});

test("hash navigation keeps loader data without another request", async () => {
  let loads = 0;
  const router = createDataRouter(
    prepareRoutes([{ path: "/security", loader: () => ++loads }]),
  );
  await router.navigate("/security");
  await router.navigate("/security#scope");
  assert.equal(loads, 1);
  assert.equal(new URL(router.getSnapshot().url).hash, "#scope");
  assert.equal(router.getSnapshot().data, 1);
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
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
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
    assert.equal(browserHistory.state, store.getSnapshot());
  });
  const navigation = router.navigate("/guide");
  assert.equal(store.getSnapshot().key, "existing");
  assert.deepEqual(scrollPositions(router).get("existing"), [0, 420]);
  assert.equal(updates, 0);
  resolve("guide");
  await navigation;
  assert.equal(updates, 1);
  assert.equal(store.getSnapshot().type, "PUSH");
  assert.equal(router.getSnapshot().data, "guide");
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
  assert.match(await html, /<output>42<\/output>/);
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
  assert.match(html, /Temporarily unavailable/);
  assert.doesNotMatch(html, /Unexpected success/);
});

test("Await propagates rejection when no local error element exists", async () => {
  const error = new Error("Deferred request failed");
  const html = renderToStringAsync(
    <Suspense fallback={<p>Loading</p>}>
      <Await resolve={Promise.reject(error)}>{() => <p>Ready</p>}</Await>
    </Suspense>,
  );
  await assert.rejects(Promise.resolve(html), error);
});

test("root revalidation only loads an explicitly configured route", async () => {
  const { attachRootData } = await import(
    "../packages/client/src/root-data.ts"
  );
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
    assert.deepEqual(store.getSnapshot(), { revision: configured ? 1 : 0 });
    assert.equal(loads, configured ? 1 : 0);
    router.dispose();
  }
});

test("targeting root refreshes root data without refreshing the page", async () => {
  const { attachRootData } = await import(
    "../packages/client/src/root-data.ts"
  );
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
  assert.equal(store.getSnapshot(), 1);
  assert.equal(pageLoads, 1);
  router.dispose();
});

test("disposing during root refresh aborts work and leaves root data intact", async () => {
  const { attachRootData } = await import(
    "../packages/client/src/root-data.ts"
  );
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
  assert.equal(signal?.aborted, true);
  finish(1);
  await pending;
  assert.equal(store.getSnapshot(), 0);
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
  assert.equal(router.getSnapshot().error?.cause, failure);
  assert.equal(loads, 0);
  await router.navigate("/");
  assert.equal(router.getSnapshot().error, undefined);
  assert.equal(router.getSnapshot().data, 1);
  assert.equal(imports, 2);
  await router.revalidate();
  assert.equal(router.getSnapshot().data, 2);
  assert.equal(imports, 2);
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
  assert.deepEqual(route.meta?.(args), []);
  await route.preload?.();
  assert.deepEqual(route.meta?.(args), [{ title: "Ada" }]);
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
  assert.equal(mutations, 1);
  assert.equal(rootLoads, 0);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("X-Mutation"), "created");
  assert.deepEqual(await response.json(), { id: "7", name: "Ada" });
});

test("resource routes reject missing handlers instead of rendering a document", async () => {
  const response = await renderApplication(
    new Request("http://local/readonly", { method: "POST" }),
    [{ path: "/readonly", loader: () => ({ readable: true }) }],
    root,
    "/entry.js",
  );
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "No handler" });
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
  assert.equal(document.status, 202);
  assert.equal(document.statusText, "Accepted");
  assert.equal(document.headers.get("X-Report"), "queued");
  assert.deepEqual(await document.json(), { ready: true });
  assert.equal(transport.status, 200);
  assert.equal(transport.headers.get("X-Report"), "queued");
  assert.deepEqual(await transport.json(), { ready: true });
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
  assert.equal(actions, 1);
  assert.equal(loads, 0);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/done");
  assert.equal(response.headers.get("Set-Cookie"), "saved=1");
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
  assert.deepEqual(await plain.json(), { value: 3 });
  const error = await normalizeResult(await broken.json());
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Handler failed");
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { error: "No route" });
});

function SavedAction() {
  const result = useActionData<{ saved: string }>();
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
  assert.equal(actions, 1);
  assert.equal(loads, 1);
  assert.equal(response.status, 200);
  assert.match(html, /<output>name=hello<\/output>/);
  assert.match(html, /"actionData":\{"saved":"name=hello"\}/);
  assert.match(html, /"data":\{"count":1\}/);
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
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("Set-Cookie"), "draft=1; HttpOnly");
  assert.match(response.headers.get("Content-Type") ?? "", /text\/html/);
  assert.match(
    await response.text(),
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
  assert.equal(response.status, 500);
  assert.match(await response.text(), /"message":"Cannot save"/);
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
  assert.equal(response.headers.get("Content-Type"), "text/plain");
  assert.equal(await response.text(), "Exported");
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
  assert.match(html, /__smolterPending/);
  assert.match(html, /type="module" async/);
  assert.match(html, /\[0,"ready",null\]/);
  assert.match(html, /nonce="test-nonce"/);
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
  assert.match(html, /Resolved SSR detail/);
});

test("Await renders resolved values without a pending boundary", async () => {
  const html = await renderToStringAsync(
    <Await resolve="ready" fallback="pending">
      {(value) => <p>{value}</p>}
    </Await>,
  );
  assert.equal(html, "<p>ready</p>");
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
  assert.match(html, /<main>Standalone route<\/main>/);
});
