import {
  createRouter,
  type DataOf,
  defineRoute,
  matchRoutes,
} from "@smolter/core";
import type { ActionData, LoaderData } from "@smolter/react";
import { loadRouter, serialize } from "@smolter/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import { deferred } from "./helpers/deferred.ts";

const body = () => new FormData();
describe("data router", () => {
  it("matches static paths, encoded params, wildcards and trailing slashes", () => {
    const routes = [
      defineRoute("/people/:name", {}),
      defineRoute("/files/*", {}),
    ];

    expect(matchRoutes(routes, "/people/J%C3%B8rn/")?.params).toEqual({
      name: "Jørn",
    });

    expect(matchRoutes(routes, "/people/a&b+c=d")?.params).toEqual({
      name: "a&b+c=d",
    });

    expect(matchRoutes(routes, "/people/%26%2B%3D%2F")?.params).toEqual({
      name: "&+=/",
    });

    expect(matchRoutes(routes, "/files/a/b")?.params).toEqual({ "*": "a/b" });

    expect(matchRoutes(routes, "/people")).toBeUndefined();

    expect(matchRoutes(routes, "/people/a/b")).toBeUndefined();
  });

  it("infers route and function data without duplicated interfaces", () => {
    const loader = async () => ({ name: "Ada" });
    const action = () => ({ saved: true });
    const route = defineRoute("/", { loader, action });
    expectTypeOf<DataOf<typeof loader>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<LoaderData<typeof route>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<ActionData<typeof route>>().toEqualTypeOf<{
      saved: boolean;
    }>();
  });

  it("passes Request, params and abort signal to loaders", async () => {
    const router = await loadRouter(
      [
        defineRoute("/:id", {
          loader: ({ request, params, signal }) => ({
            id: params.id,
            search: new URL(request.url).search,
            aborted: signal.aborted,
          }),
        }),
      ],
      "https://example.com/42?q=hello",
    );

    expect(router.getSnapshot().data).toEqual({
      id: "42",
      search: "?q=hello",
      aborted: false,
    });
  });

  it("revalidates after a fetcher action without navigating", async () => {
    let count = 0;
    const router = await loadRouter(
      [
        defineRoute("/", { loader: () => count }),
        defineRoute("/increment", {
          action: async ({ request }) => {
            expect(request.method).toBe("POST");

            expect((await request.formData()).get("value")).toBe("one");

            return ++count;
          },
        }),
      ],
      "https://test.dev/",
    );
    const fetcher = router.createFetcher();
    const data = body();
    data.set("value", "one");

    await fetcher.submit("/increment", data);

    expect(router.getSnapshot().url).toBe("https://test.dev/");

    expect(router.getSnapshot().data).toBe(1);

    expect(fetcher.getSnapshot()).toMatchObject({ data: 1, state: "idle" });
    router.dispose();
  });

  it("supports fetcher loads and scoped failures", async () => {
    const router = await loadRouter(
      [
        defineRoute("/", { loader: () => "home" }),
        defineRoute("/resource", { loader: () => "resource" }),
      ],
      "https://test.dev/",
    );
    const fetcher = router.createFetcher();

    await fetcher.load("/resource");

    expect(fetcher.getSnapshot().data).toBe("resource");

    expect(router.getSnapshot().data).toBe("home");

    await fetcher.submit("/resource", body());

    expect(fetcher.getSnapshot().error?.message).toMatch("No action");

    expect(router.getSnapshot().error).toBeUndefined();
  });

  it("revalidates manually and honors shouldRevalidate", async () => {
    let runs = 0;
    const router = await loadRouter(
      [
        defineRoute("/", {
          loader: () => ++runs,
          shouldRevalidate: ({ reason }) => reason === "manual",
          action: () => null,
        }),
      ],
      "https://test.dev/",
    );

    await router.submit("/", body());

    expect(runs).toBe(1);

    await router.revalidate();

    expect(runs).toBe(2);
  });

  it("keeps action data during revalidation and clears it on navigation", async () => {
    const router = await loadRouter(
      [
        defineRoute("/", { loader: () => 1, action: () => ({ ok: true }) }),
        defineRoute("/other", {}),
      ],
      "https://test.dev/",
    );

    await router.submit("/", body());

    expect(router.getSnapshot().actionData).toEqual({ ok: true });

    await router.navigate("/other");

    expect(router.getSnapshot().actionData).toBeUndefined();
  });

  it("aborts stale navigation and prevents late data overwrites", async () => {
    let finish: (value: string) => void = () => {};
    let signal: AbortSignal | undefined;
    const router = createRouter([
      defineRoute("/slow", {
        loader: (args) => {
          signal = args.signal;

          return new Promise<string>((resolve) => {
            finish = resolve;
          });
        },
      }),
      defineRoute("/fast", { loader: () => "fast" }),
    ]);
    const slow = router.navigate("/slow");
    await Promise.resolve();

    await router.navigate("/fast");
    finish("slow");
    await slow;

    expect(signal?.aborted).toBe(true);

    expect(router.getSnapshot().data).toBe("fast");
  });

  it("last fetcher request wins", async () => {
    let finish: (value: string) => void = () => {};
    const router = createRouter([
      defineRoute("/slow", {
        loader: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      }),
      defineRoute("/fast", { loader: () => "fast" }),
    ]);
    const fetcher = router.createFetcher();
    const slow = fetcher.load("/slow");
    await Promise.resolve();

    await fetcher.load("/fast");
    finish("slow");
    await slow;

    expect(fetcher.getSnapshot().data).toBe("fast");
  });

  it("returns errors with causes for rejected handlers", async () => {
    const cause = new Error("network unavailable");
    const router = await loadRouter(
      [defineRoute("/", { loader: () => Promise.reject(cause) })],
      "https://test.dev/",
    );

    expect(router.getSnapshot().error?.cause).toBe(cause);

    expect(router.getSnapshot().state).toBe("idle");
  });

  it("handles loader and action redirects and bounds loops", async () => {
    const routes = [
      defineRoute("/", { loader: () => redirect("/next") }),
      defineRoute("/next", {
        loader: () => "next",
        action: () => redirect("/done"),
      }),
      defineRoute("/done", { loader: () => "done" }),
    ];
    const router = await loadRouter(routes, "https://test.dev/");

    expect(router.getSnapshot().data).toBe("next");

    await router.submit("/next", body());

    expect(router.getSnapshot().data).toBe("done");

    const loop = await loadRouter(
      [defineRoute("/", { loader: () => redirect("/") })],
      "https://test.dev/",
    );

    expect(loop.getSnapshot().error?.message).toMatch("Redirect loop");
  });

  it("isolates server requests and safely serializes hydration", async () => {
    const routes = [
      defineRoute("/:id", {
        loader: ({ params }) => ({ id: params.id, html: "</script>" }),
      }),
    ];
    const [one, two] = await Promise.all([
      loadRouter(routes, "https://test.dev/one"),
      loadRouter(routes, "https://test.dev/two"),
    ]);

    expect(one.getSnapshot().data).not.toEqual(two.getSnapshot().data);

    const serialized = serialize(one.getSnapshot());

    expect(serialized).not.toContain("</script>");

    const hydrated = createRouter(routes, {
      hydrationData: JSON.parse(serialized),
    });
    const stop = hydrated.start();

    expect(hydrated.getSnapshot().data).toEqual(one.getSnapshot().data);
    stop();
  });

  it("reports missing routes and rejects external navigation", async () => {
    const router = await loadRouter([], "https://test.dev/missing");

    expect(router.getSnapshot().error?.message).toMatch("No route");

    await router.navigate("https://elsewhere.dev/");

    expect(router.getSnapshot().url).toBe("https://test.dev/missing");

    expect(router.getSnapshot().error?.message).toMatch("External URL");
  });
});

it("forwards incoming SSR request headers", async () => {
  const router = await loadRouter(
    [
      defineRoute("/", {
        loader: ({ request }) => request.headers.get("X-Example"),
      }),
    ],
    new Request("https://test.dev/", {
      headers: { "X-Example": "request-local" },
    }),
  );

  expect(router.getSnapshot().data).toBe("request-local");
});

it("retains action data when a Form navigates to a different route", async () => {
  let runs = 0;
  const router = await loadRouter(
    [
      defineRoute("/", {}),
      defineRoute("/save", {
        action: () => ({ saved: true }),
        loader: () => ++runs,
      }),
    ],
    "https://test.dev/",
  );

  await router.submit("/save", body());

  expect(router.getSnapshot().url).toBe("https://test.dev/save");

  expect(router.getSnapshot().actionData).toEqual({ saved: true });

  expect(runs).toBe(1);
});

function redirect(url: string) {
  return new Response(null, { status: 303, headers: { Location: url } });
}

it("fetcher revalidation does not take a pending navigation back to the old URL", async () => {
  let finishAction: () => void = () => {};
  let finishPage: () => void = () => {};
  let pageRuns = 0;
  const router = await loadRouter(
    [
      defineRoute("/", {
        loader: () => "home",
        action: () =>
          new Promise<void>((resolve) => {
            finishAction = resolve;
          }),
      }),
      defineRoute("/next", {
        loader: async () => {
          if (++pageRuns === 1)
            await new Promise<void>((resolve) => {
              finishPage = resolve;
            });

          return "next";
        },
      }),
    ],
    "https://test.dev/",
  );
  const action = router.createFetcher().submit("/", body());
  await Promise.resolve();

  const navigation = router.navigate("/next");
  await Promise.resolve();
  finishAction();
  await action;
  finishPage();
  await navigation;

  expect(router.getSnapshot().url).toBe("https://test.dev/next");

  expect(router.getSnapshot().data).toBe("next");
});

it("selects client handlers locally and skips them during SSR", async () => {
  let clientLoads = 0;
  let clientActions = 0;
  const route = defineRoute("/", {
    loader: () => ({ source: "server" as const }),
    action: () => ({ source: "server-action" as const }),
    clientLoader: () => {
      clientLoads++;

      return { source: "client" as const };
    },
    clientAction: () => {
      clientActions++;

      return { source: "client-action" as const };
    },
  });
  const server = await loadRouter([route], "https://test.dev/");

  expect(server.getSnapshot().data).toEqual({ source: "server" });
  await server.submit("/", body());

  expect(server.getSnapshot().actionData).toEqual({ source: "server-action" });

  expect(clientLoads).toBe(0);

  expect(clientActions).toBe(0);

  const client = createRouter([route]);
  await client.navigate("/");

  expect(client.getSnapshot().data).toEqual({ source: "client" });

  const fetcher = client.createFetcher();

  await fetcher.submit("/", body());

  expect(fetcher.getSnapshot().data).toEqual({ source: "client-action" });

  expect(clientLoads).toBe(2);

  expect(clientActions).toBe(1);
  expectTypeOf<LoaderData<typeof route>>().toEqualTypeOf<
    { source: "server" } | { source: "client" }
  >();
  expectTypeOf<ActionData<typeof route>>().toEqualTypeOf<
    { source: "server-action" } | { source: "client-action" }
  >();
});

it("loads a client-only route after its empty SSR snapshot is hydrated", async () => {
  let runs = 0;
  const route = defineRoute("/", {
    clientLoader: () => ({ count: ++runs }),
    clientAction: () => ({ saved: true }),
  });
  expectTypeOf<LoaderData<typeof route>>().toEqualTypeOf<{ count: number }>();
  expectTypeOf<ActionData<typeof route>>().toEqualTypeOf<{ saved: boolean }>();

  const server = await loadRouter([route], "https://test.dev/");

  expect(runs).toBe(0);

  expect(server.getSnapshot().data).toBeUndefined();

  const hydrationData = server.getSnapshot();

  expect((await server.submit("/", body())).error?.message).toBe("No action");

  const client = createRouter([route], {
    hydrationData,
  });
  const loaded = new Promise<void>((resolve) =>
    client.subscribe(() => {
      if (client.getSnapshot().data) resolve();
    }),
  );
  const stop = client.start();
  await loaded;

  expect(client.getSnapshot().data).toEqual({ count: 1 });
  stop();
  client.dispose();
});

for (const server of [false, true]) {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    it(`routes ${method} fetchers to a parameterized ${server ? "server" : "client"} action`, async () => {
      let reads = 0;
      const calls: string[] = [];
      const handler =
        (source: string) =>
        async ({ request, params }: import("@smolter/core").DataArgs) => {
          calls.push(source);

          return {
            source,
            id: params.id,
            method: request.method,
            title: (await request.formData()).get("title"),
          };
        };
      const routes = [
        defineRoute("/tasks", { loader: () => ++reads }),
        defineRoute("/tasks/:id", {
          loader: () => ({ source: "loader" }),
          clientLoader: () => ({ source: "clientLoader" }),
          action: handler("action"),
          clientAction: handler("clientAction"),
        }),
      ];
      const url = "https://test.dev/tasks";
      const router = server
        ? await loadRouter(routes, url)
        : createRouter(routes, { url });

      if (!server) await router.navigate("/tasks");

      const fetcher = router.createFetcher();

      await fetcher.load("/tasks/42");

      expect(fetcher.getSnapshot().data).toEqual({
        source: server ? "loader" : "clientLoader",
      });

      const data = new FormData();
      data.set("title", "Write the docs");

      await fetcher.submit("/tasks/42", data, { method });

      expect(fetcher.getSnapshot().data).toEqual({
        source: server ? "action" : "clientAction",
        id: "42",
        method,
        title: "Write the docs",
      });

      expect(calls).toEqual([server ? "action" : "clientAction"]);

      expect(router.getSnapshot().url).toBe("https://test.dev/tasks");

      expect(router.getSnapshot().data).toBe(2);

      expect(router.getSnapshot().actionData).toBeUndefined();
      router.dispose();
    });
  }
}

it("keeps fetchers independent from a hydrated page error", () => {
  const router = createRouter([], {
    hydrationData: {
      url: "https://test.dev/",
      params: {},
      data: "page data",
      actionData: "page action",
      error: new Error("Page failed"),
      state: "idle",
    },
  });
  const fetcher = router.createFetcher();

  expect(fetcher.getSnapshot().state).toBe("idle");
  expect(fetcher.getSnapshot().data).toBeUndefined();
  expect(fetcher.getSnapshot().error).toBeUndefined();

  router.dispose();
});

it("preserves multipart boundaries while forwarding SSR request headers", async () => {
  const route = defineRoute("/", {
    loader: () => "ready",
    action: async ({ request }) => ({
      cookie: request.headers.get("cookie"),
      title: (await request.formData()).get("title"),
    }),
  });
  const router = await loadRouter(
    [route],
    new Request("https://test.dev/", {
      headers: { cookie: "session=example" },
    }),
  );
  const data = new FormData();

  data.set("title", "Keep the boundary");

  const result = await router.submit("/", data);

  expect(result.error).toBeUndefined();
  expect(result.data).toEqual({
    cookie: "session=example",
    title: "Keep the boundary",
  });
  router.dispose();
});

it("does not reload a completed SSR loader just because it returned undefined", async () => {
  let calls = 0;
  const route = defineRoute("/", {
    loader: () => {
      calls++;
    },
  });
  const server = await loadRouter([route], "https://test.dev/");
  const client = createRouter([route], { hydrationData: server.getSnapshot() });
  const stop = client.start();

  await Promise.resolve();

  expect(calls).toBe(1);
  expect(client.getSnapshot().state).toBe("idle");

  stop();
  client.dispose();
  server.dispose();
});

it("cancels a fetcher through action revalidation when the router is disposed", async () => {
  const revalidation = deferred<string>();
  const started = deferred<void>();
  let loads = 0;
  let actionSignal: AbortSignal | undefined;
  const router = createRouter([
    defineRoute("/", {
      loader: () => {
        if (loads++ === 0) return "initial";

        started.resolve();

        return revalidation.promise;
      },
      action: ({ signal }) => {
        actionSignal = signal;

        return "saved";
      },
    }),
  ]);

  await router.navigate("/");

  const fetcher = router.createFetcher();
  const states: string[] = [];
  fetcher.subscribe(() => states.push(fetcher.getSnapshot().state));

  const submission = fetcher.submit("/", body());

  await started.promise;

  router.dispose();
  revalidation.resolve("late data");
  await submission;

  expect(actionSignal?.aborted).toBe(true);
  expect(states).toEqual(["submitting", "loading"]);
  expect(router.getSnapshot().data).toBe("initial");
});

it("does not notify a stale fetcher after its redirect finishes", async () => {
  const destination = deferred<string>();
  const started = deferred<void>();
  const router = createRouter([
    defineRoute("/redirect", { loader: () => redirect("/slow") }),
    defineRoute("/slow", {
      loader: () => {
        started.resolve();

        return destination.promise;
      },
    }),
    defineRoute("/fast", { loader: () => "current" }),
  ]);
  const fetcher = router.createFetcher();
  const states: string[] = [];
  fetcher.subscribe(() => states.push(fetcher.getSnapshot().state));

  const first = fetcher.load("/redirect");

  await started.promise;
  await fetcher.load("/fast");

  destination.resolve("page data");
  await first;

  expect(states).toEqual(["loading", "loading", "idle"]);
  expect(fetcher.getSnapshot().data).toBe("current");

  router.dispose();
});

for (const revalidate of [true, false]) {
  it(`keeps a page action pending until revalidation settles (enabled: ${revalidate})`, async () => {
    const started = deferred<void>();
    const loaded = deferred<string>();
    let reads = 0;
    const router = createRouter([
      defineRoute("/", {
        loader: () => {
          if (reads++ === 0) return "initial";

          started.resolve();

          return loaded.promise;
        },
        action: () => "saved",
        shouldRevalidate: () => revalidate,
      }),
    ]);

    await router.navigate("/");

    const states: string[] = [];
    router.subscribe(() => states.push(router.getSnapshot().state));

    const submission = router.submit("/", body());

    if (revalidate) {
      await started.promise;

      expect(router.getSnapshot().state).toBe("loading");
      expect(states).not.toContain("idle");

      loaded.resolve("updated");
    }

    await submission;

    expect(router.getSnapshot().state).toBe("idle");
    expect(router.getSnapshot().actionData).toBe("saved");
    expect(router.getSnapshot().data).toBe(revalidate ? "updated" : "initial");

    router.dispose();
  });
}

it("hydrates an undefined server result without invoking the paired client loader", async () => {
  let serverReads = 0;
  let clientReads = 0;
  const route = defineRoute("/", {
    loader: () => {
      serverReads++;
    },
    clientLoader: () => {
      clientReads++;

      return "client data";
    },
  });
  const server = await loadRouter([route], "https://test.dev/");
  const client = createRouter([route], {
    hydrationData: JSON.parse(serialize(server.getSnapshot())),
  });
  const stop = client.start();

  await Promise.resolve();

  expect(serverReads).toBe(1);
  expect(clientReads).toBe(0);
  expect(client.getSnapshot().state).toBe("idle");
  expect(client.getSnapshot().data).toBeUndefined();

  stop();
  client.dispose();
  server.dispose();
});

it("disposing one fetcher leaves another request active", async () => {
  const firstResult = deferred<string>();
  const secondResult = deferred<string>();
  const signals = new Map<string, AbortSignal>();
  const router = createRouter([
    defineRoute("/:id", {
      loader: ({ params, signal }) => {
        signals.set(params.id, signal);

        return params.id === "first"
          ? firstResult.promise
          : secondResult.promise;
      },
    }),
  ]);
  const first = router.createFetcher();
  const second = router.createFetcher();
  const firstStates: string[] = [];
  const secondStates: string[] = [];
  first.subscribe(() => firstStates.push(first.getSnapshot().state));
  second.subscribe(() => secondStates.push(second.getSnapshot().state));

  const firstRequest = first.load("/first");
  const secondRequest = second.load("/second");

  await Promise.resolve();

  first.dispose();

  expect(signals.get("first")?.aborted).toBe(true);
  expect(signals.get("second")?.aborted).toBe(false);

  firstResult.resolve("stale");
  secondResult.resolve("current");
  await Promise.all([firstRequest, secondRequest]);

  expect(first.getSnapshot().data).toBeUndefined();
  expect(second.getSnapshot().data).toBe("current");
  expect(firstStates).toEqual(["loading"]);
  expect(secondStates).toEqual(["loading", "idle"]);

  router.dispose();

  expect(signals.get("second")?.aborted).toBe(true);
});

it("lets an active route retain data across navigation without skipping first visits", async () => {
  let reads = 0;
  const decisions: string[][] = [];
  const router = createRouter([
    defineRoute("/items/:id", {
      loader: ({ params }) => ({ id: params.id, reads: ++reads }),
      shouldRevalidate: ({ currentUrl, nextUrl, reason }) => {
        decisions.push([currentUrl.href, nextUrl.href, reason]);

        return false;
      },
    }),
    defineRoute("/other", {
      loader: () => "Other page",
      shouldRevalidate: () => false,
    }),
  ]);

  await router.navigate("/items/1");

  expect(reads).toBe(1);
  expect(decisions).toEqual([]);

  await router.navigate("/items/1?sort=name");
  await router.navigate("/items/2");

  expect(reads).toBe(1);
  expect(router.getSnapshot()).toMatchObject({
    url: "http://localhost/items/2",
    params: { id: "2" },
    data: { id: "1", reads: 1 },
    state: "idle",
  });
  expect(decisions).toEqual([
    [
      "http://localhost/items/1",
      "http://localhost/items/1?sort=name",
      "navigation",
    ],
    [
      "http://localhost/items/1?sort=name",
      "http://localhost/items/2",
      "navigation",
    ],
  ]);

  const fetcher = router.createFetcher();

  await fetcher.load("/items/2");

  expect(fetcher.getSnapshot().data).toEqual({ id: "2", reads: 2 });

  await router.navigate("/other");

  expect(router.getSnapshot().data).toBe("Other page");

  router.dispose();
});

it("does not skip a destination loader while an earlier navigation is pending", async () => {
  const pending = deferred<string>();
  const router = createRouter([
    defineRoute("/items/:id", {
      loader: ({ params }) =>
        params.id === "1" ? pending.promise : "Second item",
      shouldRevalidate: () => false,
    }),
  ]);
  const first = router.navigate("/items/1");

  await Promise.resolve();
  await router.navigate("/items/2");
  pending.resolve("Stale item");
  await first;

  expect(router.getSnapshot().data).toBe("Second item");

  router.dispose();
});

it("retries failed navigation even when a route opts out of revalidation", async () => {
  let reads = 0;
  const router = createRouter([
    defineRoute("/", {
      loader: () =>
        ++reads === 1 ? new Error("Temporary failure") : "Recovered",
      shouldRevalidate: () => false,
    }),
  ]);

  await router.navigate("/");

  expect(router.getSnapshot().error?.message).toBe("Temporary failure");

  await router.navigate("/");

  expect(router.getSnapshot().data).toBe("Recovered");
  expect(router.getSnapshot().error).toBeUndefined();

  router.dispose();
});
