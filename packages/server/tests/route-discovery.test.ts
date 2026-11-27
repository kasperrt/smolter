import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DiscoveredRoute } from "@smolter/core";
import { expect, it, onTestFinished } from "vitest";
import {
  createRouteDiscovery,
  discoveryTarget,
  type RouteAuthorizer,
  type RouteDiscoveryManifest,
} from "../src/discovery.ts";
import { createRequestHandler } from "../src/handler.ts";

function definition(path: string, id?: string): DiscoveredRoute {
  return {
    path,
    ...(id && { id }),
    capabilities: { loader: true },
    file: `/assets/route-${path.length}.js`,
    exports: ["default"],
    styles: [],
  };
}

const flat: RouteDiscoveryManifest = {
  build: "build-1",
  nested: false,
  routes: [
    { path: "/admin", route: definition("/admin") },
    { path: "/" },
    { path: "/*" },
  ],
};

const nested: RouteDiscoveryManifest = {
  build: "build-2",
  nested: true,
  routes: [
    { path: "/", id: "routes/_root" },
    {
      path: "/admin",
      id: "routes/admin",
      parentId: "routes/_root",
      route: definition("/admin", "routes/admin"),
    },
    {
      path: "/admin/users/:id",
      id: "routes/admin.users.$id",
      parentId: "routes/admin",
      route: definition("/admin/users/:id", "routes/admin.users.$id"),
    },
    { path: "/settings", id: "routes/settings", parentId: "routes/_root" },
    {
      path: "/settings",
      id: "routes/settings._index",
      parentId: "routes/settings",
      index: true,
      route: definition("/settings", "routes/settings._index"),
    },
  ],
};

const request = (cookie = "") =>
  new Request("https://app.example/admin", { headers: { cookie } });

async function read(response: Response) {
  return {
    status: response.status,
    cache: response.headers.get("Cache-Control"),
    body: await response.json(),
  };
}

it("reveals a protected route only to authorized requests and denies everything else identically", async () => {
  const seen: string[] = [];
  const authorize: RouteAuthorizer = (incoming, route) => {
    seen.push(route.path);
    return incoming.headers.get("cookie") === "role=admin";
  };
  const discover = createRouteDiscovery({ manifest: flat, authorize });
  expect(await read(await discover(request("role=admin"), "/admin"))).toEqual({
    status: 200,
    cache: "private, no-store",
    body: { build: "build-1", routes: [definition("/admin")] },
  });
  const deniedResponse = await read(await discover(request(), "/admin"));
  expect(deniedResponse).toEqual({
    status: 404,
    cache: "private, no-store",
    body: { routes: [] },
  });
  // Unknown, public and splat-only paths are indistinguishable from a denial.
  for (const path of ["/missing", "/", "/admin/elsewhere"])
    expect(await read(await discover(request("role=admin"), path))).toEqual(
      deniedResponse,
    );
  const failing = createRouteDiscovery({
    manifest: flat,
    authorize: () => {
      throw new Error("Session store unavailable");
    },
  });
  expect(await read(await failing(request("role=admin"), "/admin"))).toEqual(
    deniedResponse,
  );
  expect(seen).toEqual(["/admin", "/admin"]);
  const post = await discover(
    new Request("https://app.example/admin", { method: "POST" }),
    "/admin",
  );
  expect(post.status).toBe(405);
});

it("returns the protected nested chain only when every protected route is allowed", async () => {
  let allowUsers = true;
  const discover = createRouteDiscovery({
    manifest: nested,
    authorize: (_request, route) =>
      route.id !== "routes/admin.users.$id" || allowUsers,
  });
  const chain = await read(await discover(request(), "/admin/users/7"));
  expect(chain.status).toBe(200);
  expect(chain.body.routes.map((route: DiscoveredRoute) => route.id)).toEqual([
    "routes/admin",
    "routes/admin.users.$id",
  ]);
  allowUsers = false;
  expect((await discover(request(), "/admin/users/7")).status).toBe(404);
  expect(
    (await read(await discover(request(), "/admin"))).body.routes.map(
      (route: DiscoveredRoute) => route.id,
    ),
  ).toEqual(["routes/admin"]);
  // A public layout's protected index route is still delivered on its own.
  expect(
    (await read(await discover(request(), "/settings"))).body.routes.map(
      (route: DiscoveredRoute) => route.id,
    ),
  ).toEqual(["routes/settings._index"]);
});

it("validates manifests and discovery targets", () => {
  expect(() =>
    createRouteDiscovery({
      manifest: { build: 1 } as unknown as RouteDiscoveryManifest,
      authorize: () => true,
    }),
  ).toThrow("not a route discovery manifest");
  expect(discoveryTarget(new URL("https://app.example/admin"))).toBeUndefined();
  expect(
    discoveryTarget(new URL("https://app.example/admin.__smolter-routes")),
  ).toBe("/admin");
  expect(
    discoveryTarget(new URL("https://app.example/.__smolter-routes")),
  ).toBe("/");
  expect(
    discoveryTarget(new URL("https://app.example//x.__smolter-routes")),
  ).toBeInstanceOf(Error);
});

it("serves discovery through createRequestHandler with the request's cookies", async () => {
  const handler = createRequestHandler({
    entry: "/assets/client.js",
    build: {
      default: () => new Response("document"),
      handleDataRequest: () => Response.json(null),
    },
    routeDiscovery: {
      manifest: flat,
      authorize: (incoming) => incoming.headers.get("cookie") === "role=admin",
    },
  });
  const server = createServer((incoming, outgoing) => {
    void handler(incoming, outgoing, () => {
      outgoing.statusCode = 500;
      outgoing.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(() => {
    server.close();
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const allowed = await fetch(`${origin}/admin.__smolter-routes`, {
    headers: { cookie: "role=admin" },
  });
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("cache-control")).toBe("private, no-store");
  expect((await allowed.json()).routes).toEqual([definition("/admin")]);
  const anonymous = await fetch(`${origin}/admin.__smolter-routes`);
  expect(anonymous.status).toBe(404);
  expect(await anonymous.json()).toEqual({ routes: [] });
  const malformed = await fetch(`${origin}//evil.example.__smolter-routes`);
  expect(malformed.status).toBe(400);
  expect(await (await fetch(`${origin}/admin`)).text()).toBe("document");
});
