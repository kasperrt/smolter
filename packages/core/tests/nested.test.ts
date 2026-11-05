import { createNestedRouter } from "@smolter/core/nested";
import { resolveData } from "@smolter/core/responses";
import { describe, expect, it } from "vitest";

describe("nested routing", () => {
  it("retains parent values and revalidates them once after a child action", async () => {
    let reads = 0;
    let writes = 0;
    const router = createNestedRouter([
      {
        id: "shell",
        path: "/",
        clientLoader: () => ++reads,
        shouldRevalidate: ({ reason }) => reason === "action",
      },
      {
        id: "one",
        path: "/one",
        parentId: "shell",
        clientLoader: () => "one",
        clientAction: () => ++writes,
      },
      { id: "two", path: "/two", parentId: "shell", clientLoader: () => "two" },
    ]);
    await router.navigate("/one");
    await router.navigate("/two");
    expect(reads).toBe(1);
    await router.submit("/one", new FormData());
    expect(writes).toBe(1);
    expect(reads).toBe(2);
    expect(router.getSnapshot().data).toEqual({
      matches: ["shell", "one"],
      values: { shell: 2, one: "one" },
    });
    router.dispose();
  });
  it("targets parents exclusively and honors each layout's veto", async () => {
    let parents = 0;
    let children = 0;
    let allow = true;
    const router = createNestedRouter([
      {
        id: "parent",
        path: "/",
        clientLoader: () => ++parents,
        shouldRevalidate: () => allow,
      },
      {
        id: "child",
        path: "/child",
        parentId: "parent",
        clientLoader: () => ++children,
      },
    ]);
    await router.navigate("/child");
    await router.revalidate({ route: "parent" });
    expect([parents, children]).toEqual([2, 1]);
    allow = false;
    await router.revalidate({ route: "parent" });
    expect([parents, children]).toEqual([2, 1]);
    await router.revalidate({ route: "child" });
    expect([parents, children]).toEqual([2, 2]);
    router.dispose();
  });
  it("does not refresh an independent child fetcher when only its parent is targeted", async () => {
    let parents = 0;
    let children = 0;
    const router = createNestedRouter([
      { id: "parent", path: "/", clientLoader: () => ++parents },
      {
        id: "child",
        path: "/child",
        parentId: "parent",
        clientLoader: () => ++children,
      },
    ]);
    await router.navigate("/child");
    const fetcher = router.createFetcher();
    await fetcher.load("/child");
    expect(children).toBe(2);
    await router.revalidate({ route: "parent" });
    expect([parents, children]).toEqual([2, 2]);
    router.dispose();
  });
  it("selects multiple ancestors without refreshing their descendants", async () => {
    const reads = { root: 0, layout: 0, page: 0 };
    let allowLayout = true;
    const router = createNestedRouter([
      { id: "root", path: "/", clientLoader: () => ++reads.root },
      {
        id: "layout",
        path: "/settings",
        parentId: "root",
        clientLoader: () => ++reads.layout,
        shouldRevalidate: () => allowLayout,
      },
      {
        id: "page",
        path: "/settings/profile",
        parentId: "layout",
        clientLoader: () => ++reads.page,
      },
    ]);
    await router.navigate("/settings/profile");
    await router.revalidate({ route: "/settings" });
    expect(reads).toEqual({ root: 1, layout: 2, page: 1 });
    allowLayout = false;
    await router.revalidate({ route: ["root", "layout"] });
    expect(reads).toEqual({ root: 2, layout: 2, page: 1 });
    expect(router.getSnapshot().data).toMatchObject({ values: reads });
    await router.revalidate({ route: "inactive" });
    expect(reads).toEqual({ root: 2, layout: 2, page: 1 });
    router.dispose();
  });
  it("loads a vetoing parent initially but respects its veto after a child mutation", async () => {
    let parents = 0;
    let children = 0;
    let mutations = 0;
    const router = createNestedRouter([
      {
        id: "parent",
        path: "/",
        clientLoader: () => ++parents,
        shouldRevalidate: () => false,
      },
      {
        id: "child",
        path: "/child",
        parentId: "parent",
        clientLoader: () => ++children,
        clientAction: () => ++mutations,
      },
    ]);
    await router.navigate("/child");
    expect([parents, children]).toEqual([1, 1]);
    await router.submit("/child", new FormData());
    expect([parents, children, mutations]).toEqual([1, 2, 1]);
    router.dispose();
  });
  it("runs a pathless authentication parent before showing the index and targets root actions", async () => {
    let authenticated = 0;
    let actions = 0;
    const router = createNestedRouter(
      [
        {
          id: "root",
          path: "/platform",
          clientAction: () => {
            actions++;
            return new Response(null, {
              status: 303,
              headers: { Location: "/login" },
            });
          },
        },
        {
          id: "auth",
          path: "/platform/",
          parentId: "root",
          pathless: true,
          clientLoader: () => ++authenticated,
        },
        {
          id: "index",
          path: "/platform/",
          parentId: "auth",
          index: true,
          clientLoader: () => "home",
        },
        {
          id: "login",
          path: "/platform/login",
          parentId: "root",
          clientLoader: () => "login",
        },
      ],
      { basename: "/platform" },
    );
    await router.navigate("/platform/");
    expect(authenticated).toBe(1);
    expect(router.getSnapshot().data).toMatchObject({
      matches: ["root", "auth", "index"],
    });
    await router.submit("/platform/", new FormData());
    expect(actions).toBe(1);
    expect(router.getSnapshot().url).toBe("http://localhost/platform/login");
    router.dispose();
  });
  it("keeps ancestor data when a child loader fails", async () => {
    const router = createNestedRouter([
      { id: "shell", path: "/", clientLoader: () => "account" },
      {
        id: "child",
        path: "/child",
        parentId: "shell",
        clientLoader: () => new Error("denied"),
      },
    ]);
    await router.navigate("/child");
    expect(router.getSnapshot().error).toMatchObject({
      routeId: "child",
      branch: { matches: ["shell", "child"], values: { shell: "account" } },
    });
    router.dispose();
  });
  it("does not commit an abandoned parent result", async () => {
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const router = createNestedRouter([
      {
        id: "shell",
        path: "/",
        clientLoader: ({ request }) =>
          new URL(request.url).pathname === "/one" ? pending : "current",
      },
      { id: "one", path: "/one", parentId: "shell" },
      { id: "two", path: "/two", parentId: "shell" },
    ]);
    const abandoned = router.navigate("/one");
    await router.navigate("/two?mode=current#scope");
    release("stale");
    await abandoned;
    expect(router.getSnapshot().data).toMatchObject({
      values: { shell: "current" },
    });
    expect(router.getSnapshot().url).toBe(
      "http://localhost/two?mode=current#scope",
    );
    router.dispose();
  });
});

it("keeps route definitions isolated between router instances", async () => {
  let imports = 0;
  const definitions = [
    {
      id: "one",
      path: "/",
      lazy: async () => {
        imports++;
        return { clientLoader: () => imports };
      },
    },
  ];
  const one = createNestedRouter(definitions);
  const two = createNestedRouter(definitions);
  await one.navigate("/");
  await two.navigate("/");
  expect(imports).toBe(2);
  expect(definitions[0]).not.toHaveProperty("preload");
  one.dispose();
  two.dispose();
});

it("applies the application base to fetcher reads and explicit root submissions", async () => {
  let mutations = 0;
  const router = createNestedRouter(
    [
      {
        id: "root",
        path: "/platform",
        clientAction: () => {
          mutations++;
          return new Response(null, {
            status: 303,
            headers: { Location: "/login" },
          });
        },
      },
      {
        id: "login",
        path: "/platform/login",
        parentId: "root",
        clientLoader: () => "login",
      },
      {
        id: "resource",
        path: "/platform/api/count",
        parentId: "root",
        clientLoader: ({ request }) => new URL(request.url).pathname,
      },
    ],
    { basename: "/platform" },
  );
  await router.navigate("/login");
  const fetcher = router.createFetcher();
  await fetcher.load("/api/count");
  expect(fetcher.getSnapshot().data).toBe("/platform/api/count");
  await fetcher.submit("/", new FormData());
  expect(mutations).toBe(1);
  expect(router.getSnapshot().url).toBe("http://localhost/platform/login");
  router.dispose();
});

it("retries failed lazy modules and preserves server delegates and error owners", async () => {
  let attempts = 0;
  const local = createNestedRouter([
    {
      id: "lazy",
      path: "/lazy",
      lazy: async () => {
        if (++attempts === 1) throw new Error("chunk unavailable");
        return {
          loader: () => "server read",
          clientLoader: ({ serverLoader }) => serverLoader(),
          action: () => "server write",
          clientAction: ({ serverAction }) => serverAction(),
        };
      },
    },
    {
      id: "failed",
      path: "/failed",
      clientAction: () => new Error("mutation failure"),
    },
    { id: "empty", path: "/empty" },
    {
      id: "redirect",
      path: "/redirect",
      loader: () =>
        new Response(null, { status: 302, headers: { Location: "/lazy" } }),
    },
  ]);
  const fetcher = local.createFetcher();
  await fetcher.submit("/failed", new FormData());
  expect(fetcher.getSnapshot().error).toMatchObject({ routeId: "failed" });
  await local.navigate("/lazy");
  expect(local.getSnapshot().error).toMatchObject({ routeId: "lazy" });
  await local.navigate("/lazy");
  expect(local.getSnapshot().data).toMatchObject({
    values: { lazy: "server read" },
  });
  await fetcher.load("/lazy");
  expect(fetcher.getSnapshot().data).toBe("server read");
  await local.submit("/lazy", new FormData());
  expect(local.getSnapshot().actionData).toBe("server write");
  await local.submit("/failed", new FormData());
  expect(local.getSnapshot().error).toMatchObject({ routeId: "failed" });
  await fetcher.load("/empty");
  expect(fetcher.getSnapshot().data).toBeUndefined();
  await local.submit("/empty", new FormData());
  expect(local.getSnapshot().error?.message).toBe("No action");
  await local.navigate("/redirect");
  expect(local.getSnapshot().url).toBe("http://localhost/lazy");
  local.dispose();
  expect(() =>
    createNestedRouter([{ id: "missing", path: "/", parentId: "unknown" }]),
  ).toThrow("Invalid route parent");
  expect(() =>
    createNestedRouter([{ id: "cycle", path: "/", parentId: "cycle" }]),
  ).toThrow("Invalid route parent");
});

it("retains already-prefixed redirect destinations", async () => {
  const router = createNestedRouter(
    [
      {
        id: "start",
        path: "/platform/start",
        clientLoader: () =>
          new Response(null, {
            status: 302,
            headers: { Location: "/platform/end?done=1#scope" },
          }),
      },
      { id: "end", path: "/platform/end", clientLoader: () => "done" },
    ],
    { basename: "/platform" },
  );
  await router.navigate("/start");
  expect(router.getSnapshot().url).toBe(
    "http://localhost/platform/end?done=1#scope",
  );
  router.dispose();
});

it("keeps prototype-named route data as an own property", async () => {
  const data = { admin: true, optional: Promise.resolve("resolved") };
  const router = createNestedRouter([
    { id: "__proto__", path: "/", clientLoader: () => data },
  ]);
  await router.navigate("/");
  const branch = router.getSnapshot().data as {
    values: Record<string, unknown>;
  };
  expect(Object.hasOwn(branch.values, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(branch.values)).not.toBe(data);
  expect(branch.values.admin).toBeUndefined();
  expect(await resolveData(branch.values)).toEqual({
    ["__proto__"]: { admin: true, optional: "resolved" },
  });
  router.dispose();
});
