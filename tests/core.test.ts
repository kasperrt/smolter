import {
  createRouter,
  type DataOf,
  defineRoute,
  matchRoutes,
} from "@smolter/core";
import type { ActionData, LoaderData } from "@smolter/react";
import { loadRouter, serialize } from "@smolter/server";
import { describe, expect, expectTypeOf, it } from "vitest";

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

  expect((await server.submit("/", body())).error?.message).toBe("No action");

  const client = createRouter([route], {
    hydrationData: { ...server.getSnapshot(), error: undefined },
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
      const router = createRouter(
        [
          defineRoute("/tasks", { loader: () => ++reads }),
          defineRoute("/tasks/:id", {
            loader: () => ({ source: "loader" }),
            clientLoader: () => ({ source: "clientLoader" }),
            action: handler("action"),
            clientAction: handler("clientAction"),
          }),
        ],
        { server, url: "https://test.dev/tasks" },
      );

      await router.navigate("/tasks");

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
