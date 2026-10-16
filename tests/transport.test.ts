import { serverRoute } from "@smolter/client";
import { createRouter, defineRoute } from "@smolter/core";
import { handleRequest } from "@smolter/server";
import { afterEach, expect, it, vi } from "vitest";
import { deferred } from "./helpers/deferred";

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  "navigation aborts server fetches with client call-through: %s",
  async (callThrough) => {
    const started = deferred<AbortSignal>();
    const aborted = vi.fn();

    vi.stubGlobal("fetch", (_url: string, options: RequestInit) => {
      const signal = options.signal!;

      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted();
          reject(signal.reason);
        });

        started.resolve(signal);
      });
    });

    const router = createRouter([
      serverRoute("/slow", {
        ...(callThrough && {
          clientLoader: ({ serverLoader }) => serverLoader(),
        }),
      }),
      defineRoute("/next", { loader: () => "Current page" }),
    ]);
    const previous = router.navigate("/slow");
    const signal = await started.promise;

    expect(signal.aborted).toBe(false);

    await router.navigate("/next");
    await previous;

    expect(signal.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    expect(router.getSnapshot()).toMatchObject({
      url: "http://localhost/next",
      data: "Current page",
      state: "idle",
    });
    expect(router.getSnapshot().error).toBeUndefined();

    router.dispose();
  },
);

it("connects client callbacks to registered server handlers and keeps fetcher reads local", async () => {
  let reads = 0;
  let title = "Before";
  const server = defineRoute("/tasks/:id", {
    loader: ({ params }) => ({ id: params.id, title, reads: ++reads }),
    action: async ({ request }) => {
      title = String((await request.formData()).get("title"));

      return { changed: true, method: request.method };
    },
  });

  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    const target = new URL(url, "https://example.test").searchParams.get(
      "url",
    )!;

    return handleRequest(
      [server],
      new Request(new URL(target, "https://example.test"), options),
    );
  });

  const client = serverRoute("/tasks/:id", {
    clientLoader: ({ serverLoader }) => serverLoader(),
    clientAction: async ({ request, serverAction }) => {
      expect((await request.formData()).get("title")).toBe("After");

      return await serverAction();
    },
  });
  const router = createRouter([
    defineRoute("/", { loader: () => "Page data" }),
    client,
  ]);

  await router.navigate("/");

  const fetcher = router.createFetcher();

  await fetcher.load("/tasks/42");

  expect(fetcher.getSnapshot().data).toEqual({
    id: "42",
    title: "Before",
    reads: 1,
  });

  expect(router.getSnapshot().data).toBe("Page data");

  const body = new FormData();

  body.set("title", "After");

  await fetcher.submit("/tasks/42", body, { method: "PATCH" });

  expect(fetcher.getSnapshot().data).toEqual({
    changed: true,
    method: "PATCH",
  });

  expect(title).toBe("After");

  expect(router.getSnapshot().url).toBe("http://localhost/");
});

it("shouldRevalidate receives mutation context and skips no-op loader reads", async () => {
  let reads = 0;
  const decide = vi.fn(() => false);
  const router = createRouter([
    defineRoute("/", { loader: () => ++reads, shouldRevalidate: decide }),
    defineRoute("/tasks/:id", { action: () => ({ changed: false }) }),
  ]);

  await router.navigate("/");

  const data = new FormData();

  data.set("title", "Same");

  await router.createFetcher().submit("/tasks/42", data, { method: "PATCH" });

  expect(reads).toBe(1);

  expect(decide).toHaveBeenCalledWith(
    expect.objectContaining({
      formMethod: "PATCH",
      formAction: "http://localhost/tasks/42",
      formData: data,
      actionResult: { changed: false },
      defaultShouldRevalidate: true,
      reason: "action",
    }),
  );
});

it("server transport handles missing routes, errors, methods, and redirects", async () => {
  const routes = [
    defineRoute("/broken", { loader: () => new Error("Failed") }),
    defineRoute("/redirect", {
      action: () =>
        new Response(null, { status: 303, headers: { Location: "/done" } }),
    }),
  ];

  expect(
    (await handleRequest(routes, new Request("https://test.dev/missing")))
      .status,
  ).toBe(404);

  expect(
    (await handleRequest(routes, new Request("https://test.dev/broken")))
      .status,
  ).toBe(500);

  expect(
    (
      await handleRequest(
        routes,
        new Request("https://test.dev/broken", { method: "POST" }),
      )
    ).status,
  ).toBe(405);

  expect(
    (
      await handleRequest(
        routes,
        new Request("https://test.dev/redirect", { method: "POST" }),
      )
    ).headers.get("X-Smolter-Redirect"),
  ).toBe("/done");
});

it("preserves Response results and rejects unsupported HTTP methods", async () => {
  const routes = [
    defineRoute("/", { loader: () => Response.json({ value: 7 }) }),
  ];
  const response = await handleRequest(
    routes,
    new Request("https://test.dev/"),
  );

  expect(await response.json()).toEqual({ value: 7 });
  expect(
    (
      await handleRequest(
        routes,
        new Request("https://test.dev/", { method: "HEAD" }),
      )
    ).status,
  ).toBe(405);
});

it("surfaces server failures through the client route error state", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "Unavailable" }, { status: 503 }),
  );

  const router = createRouter([serverRoute("/", {})]);

  await router.navigate("/");

  expect(router.getSnapshot().error?.message).toBe("Unavailable");
});

it("follows a redirect returned through the server transport", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(null, {
        headers: { "X-Smolter-Redirect": "/done" },
      }),
  );

  const router = createRouter([
    serverRoute("/", {}),
    defineRoute("/done", { loader: () => "Finished" }),
  ]);

  await router.navigate("/");

  expect(router.getSnapshot().data).toBe("Finished");
});
