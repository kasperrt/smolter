import {
  createDataRouter,
  type Route,
  type RouteDiscoveryContext,
  type RouteResolver,
} from "@smolter/core";
import { withRouteDiscovery } from "@smolter/core/discovery";
import { prefetchLink } from "@smolter/core/link-prefetch";
import { type BranchData, createNestedRouter } from "@smolter/core/nested";
import { describe, expect, it, vi } from "vitest";

interface DiscoveryCall {
  path: string;
  navigation: boolean;
}

function recorder(table: Record<string, readonly Route[]>) {
  const calls: DiscoveryCall[] = [];
  const resolve: RouteResolver = async (url, context) => {
    calls.push({ path: url.pathname, navigation: context.navigation });
    return table[url.pathname] ?? [];
  };
  return { calls, discover: withRouteDiscovery(resolve) };
}

const home: Route = { path: "/", loader: () => "home" };
const admin: Route = { path: "/admin", loader: () => "admin" };

describe("route discovery", () => {
  it("discovers an unmatched route once, then navigates with it like any other", async () => {
    const { calls, discover } = recorder({ "/admin": [admin] });
    const router = createDataRouter([home], { discover });
    await router.navigate("/admin");
    expect(router.getSnapshot()).toMatchObject({
      path: "/admin",
      data: "admin",
    });
    expect(router.routes).toContain(admin);
    await router.navigate("/");
    await router.navigate("/admin");
    expect(calls).toEqual([{ path: "/admin", navigation: true }]);
    expect(await router.discover!("/admin")).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("adds discovery methods only to routers configured with discovery", () => {
    const router = createDataRouter([home]);
    expect(router.discover).toBeUndefined();
    expect(router.resetDiscovery).toBeUndefined();
  });
  it("remembers denials until resetDiscovery, which also forgets discovered routes", async () => {
    const table: Record<string, Route[]> = {};
    const { calls, discover } = recorder(table);
    const router = createDataRouter([home], { discover });
    await router.navigate("/admin");
    expect(router.getSnapshot().error?.message).toBe("No route");
    await router.navigate("/admin");
    expect(calls).toHaveLength(1);
    // Logging in changes the answer, but only after the app resets discovery.
    table["/admin"] = [admin];
    router.resetDiscovery!();
    await router.navigate("/admin");
    expect(router.getSnapshot().data).toBe("admin");
    expect(calls).toHaveLength(2);
    router.resetDiscovery!();
    expect(router.routes).toEqual([home]);
  });
  it("retries after failed discovery requests instead of treating them as denials", async () => {
    const resolve = vi
      .fn<RouteResolver>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([admin]);
    const router = createDataRouter([home], {
      discover: withRouteDiscovery(resolve),
    });
    expect(await router.discover!("/admin")).toBe(false);
    expect(await router.discover!("/admin")).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it("asks before a public splat answers, and keeps the splat when nothing is revealed", async () => {
    const splat: Route = { path: "/*", loader: () => "not found" };
    const { calls, discover } = recorder({ "/admin": [admin] });
    const router = createDataRouter([home, splat], { discover });
    await router.navigate("/admin");
    expect(router.getSnapshot().path).toBe("/admin");
    await router.navigate("/elsewhere");
    expect(router.getSnapshot()).toMatchObject({
      path: "/*",
      data: "not found",
    });
    expect(calls.map((call) => call.path)).toEqual(["/admin", "/elsewhere"]);
    // Discovered routes are inserted ahead of less specific patterns.
    expect(router.routes.map((route) => route.path)).toEqual([
      "/admin",
      "/",
      "/*",
    ]);
  });
  it("shares one request between concurrent callers and never commits an abandoned navigation", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const contexts: RouteDiscoveryContext[] = [];
    const router = createDataRouter([home], {
      discover: withRouteDiscovery(async (_url, context) => {
        contexts.push(context);
        await gate;
        return [admin];
      }),
    });
    const fetcher = router.createFetcher();
    const abandoned = router.navigate("/admin");
    const read = fetcher.load("/admin");
    expect(router.getSnapshot().state).toBe("loading");
    await router.navigate("/");
    release();
    await abandoned;
    expect((await read).data).toBe("admin");
    expect(contexts).toHaveLength(1);
    expect(router.getSnapshot()).toMatchObject({ path: "/", data: "home" });
    expect(router.routes).toContain(admin);
  });
  it("abandons in-flight discovery on dispose without adding routes", async () => {
    let signal!: AbortSignal;
    const router = createDataRouter([home], {
      discover: withRouteDiscovery(async (_url, context) => {
        signal = context.signal;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [admin];
      }),
    });
    const pending = router.discover!("/admin");
    router.dispose();
    expect(signal.aborted).toBe(true);
    expect(await pending).toBe(false);
    expect(router.routes).toEqual([home]);
  });
  it("discovers protected nested chains and a public layout's protected index", async () => {
    const shell = { id: "shell", path: "/", clientLoader: () => "shell" };
    const settings = {
      id: "settings",
      path: "/settings",
      parentId: "shell",
      discoverIndex: true,
      clientLoader: () => "settings",
    };
    const router = createNestedRouter([shell, settings], {
      discover: withRouteDiscovery(async (url) =>
        url.pathname === "/admin/users/7"
          ? [
              {
                id: "admin",
                path: "/admin",
                parentId: "shell",
                clientLoader: () => "admin",
              },
              {
                id: "user",
                path: "/admin/users/:id",
                parentId: "admin",
                clientLoader: () => "user",
              },
            ]
          : url.pathname === "/settings"
            ? [
                {
                  id: "settings-index",
                  path: "/settings",
                  parentId: "settings",
                  index: true,
                  clientLoader: () => "index",
                },
              ]
            : [],
      ),
    });
    await router.navigate("/admin/users/7");
    expect((router.getSnapshot().data as BranchData).values).toEqual({
      shell: "shell",
      admin: "admin",
      user: "user",
    });
    await router.navigate("/settings");
    expect((router.getSnapshot().data as BranchData).matches).toEqual([
      "shell",
      "settings",
      "settings-index",
    ]);
  });
  it("discovers protected links before preloading them", async () => {
    const preload = vi.fn(async () => {});
    const { calls, discover } = recorder({
      "/admin": [{ ...admin, preload } as Route],
    });
    const router = createDataRouter([home], { discover });
    prefetchLink(router, new URL("http://localhost/admin"), false);
    await vi.waitFor(() => expect(preload).toHaveBeenCalledOnce());
    expect(calls).toEqual([{ path: "/admin", navigation: false }]);
  });
});
