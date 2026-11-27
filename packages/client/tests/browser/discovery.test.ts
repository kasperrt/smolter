import {
  createDiscoveryClient,
  type DiscoveredModule,
  nestedRouteDiscovery,
} from "@smolter/client/discovery";
import type { DiscoveredRoute, Route, RouteDiscovery } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { expect, it, vi } from "vitest";

interface LoadableRoute extends Route {
  load: () => Promise<DiscoveredModule>;
}

const moduleURL = new URL("./fixtures/discovered-route.ts", import.meta.url)
  .href;
const styleURL = new URL("./fixtures/discovered-route.css", import.meta.url)
  .href;

const definition: DiscoveredRoute = {
  path: "/admin",
  capabilities: { loader: true, meta: true },
  file: moduleURL,
  exports: ["default", "meta"],
  styles: [styleURL],
};

const client = createDiscoveryClient(
  "build-1",
  (route, load): LoadableRoute => ({ path: route.path, load }),
);

// Each call attaches to a fresh table, so remembered denials never carry over.
async function discoverWith<R extends Route>(
  discovery: RouteDiscovery<R>,
  href: string,
  navigation = false,
): Promise<R[]> {
  const table: Route[] = [];
  const attached = discovery.attach(table, {
    getSnapshot: () => ({ url: "http://localhost/" }),
  });
  await attached.load(new URL(href), navigation);
  return table as R[];
}

const discover = (href: string, navigation = false) =>
  discoverWith(client, href, navigation);

function respond(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json(body, { status }));
}

it("requests the namespaced endpoint and loads only listed exports and their styles", async (test) => {
  const fetch = respond({ build: "build-1", routes: [definition] });
  test.onTestFinished(() => {
    fetch.mockRestore();
    for (const link of document.querySelectorAll(`link[href="${styleURL}"]`))
      link.remove();
  });
  const [route] = await discover("http://localhost/admin?tab=1");
  expect(fetch).toHaveBeenCalledWith(
    "/admin.__smolter-routes",
    expect.objectContaining({ mode: "same-origin", cache: "no-store" }),
  );
  expect(route.path).toBe("/admin");
  const module = await route.load();
  expect(Object.keys(module).sort()).toEqual(["default", "meta"]);
  expect((module.default as () => string)()).toBe("discovered module");
  await route.load();
  expect(document.querySelectorAll(`link[href="${styleURL}"]`)).toHaveLength(1);
});

it("rejects malformed, unsafe and unsuccessful responses", async (test) => {
  const fetch = vi.spyOn(globalThis, "fetch");
  test.onTestFinished(() => fetch.mockRestore());
  for (const route of [
    { ...definition, file: "javascript:alert(1)" },
    { ...definition, file: "data:text/javascript,alert(1)" },
    { ...definition, file: "http://[invalid" },
    { ...definition, styles: ["javascript:alert(1)"] },
    { ...definition, exports: ["default;alert(1)"] },
    // JSON creates "__proto__" as an own key; it is not a known capability.
    { ...definition, capabilities: JSON.parse('{"__proto__": true}') },
    { ...definition, capabilities: { dataEndpoint: "https://evil.example" } },
    { ...definition, path: "admin" },
    { ...definition, id: 1 },
  ]) {
    fetch.mockResolvedValueOnce(
      Response.json({ build: "build-1", routes: [route] }),
    );
    expect(await discover("http://localhost/admin")).toEqual([]);
  }
  for (const body of [null, [], { routes: [] }, { build: "build-1" }]) {
    fetch.mockResolvedValueOnce(Response.json(body));
    expect(await discover("http://localhost/admin")).toEqual([]);
  }
  fetch.mockResolvedValueOnce(Response.json({ routes: [] }, { status: 404 }));
  expect(await discover("http://localhost/admin")).toEqual([]);
});

it("loads a newer deployment's document only for page navigations", async (test) => {
  const fetch = respond({ build: "build-2", routes: [definition] });
  const leaveDocument = vi.fn();
  configureApplication({ leaveDocument });
  test.onTestFinished(() => {
    fetch.mockRestore();
    configureApplication({});
  });
  expect(await discover("http://localhost/admin")).toEqual([]);
  expect(leaveDocument).not.toHaveBeenCalled();
  expect(await discover("http://localhost/admin", true)).toEqual([]);
  expect(leaveDocument).toHaveBeenCalledWith(new URL("http://localhost/admin"));
});

it("hands a missing chunk to deployment recovery", async (test) => {
  const fetch = respond({
    build: "build-1",
    routes: [
      {
        ...definition,
        file: new URL("./fixtures/missing-route.ts", import.meta.url).href,
        styles: [],
      },
    ],
  });
  const recovery = vi.fn();
  addEventListener("vite:preloadError", recovery);
  test.onTestFinished(() => {
    fetch.mockRestore();
    removeEventListener("vite:preloadError", recovery);
  });
  const [route] = await discover("http://localhost/admin");
  await expect(route.load()).rejects.toThrow();
  expect(recovery).toHaveBeenCalledOnce();
});

it("builds nested definitions with lazy modules from discovered routes", async (test) => {
  const fetch = respond({
    build: "build-1",
    routes: [
      {
        ...definition,
        id: "routes/admin",
        parentId: "routes/root",
        styles: [],
      },
      {
        ...definition,
        path: "/admin",
        id: "routes/admin._index",
        parentId: "routes/admin",
        index: true,
        pathless: false,
        styles: [],
      },
    ],
  });
  test.onTestFinished(() => fetch.mockRestore());
  const [layout, index] = await discoverWith(
    nestedRouteDiscovery("build-1"),
    "http://localhost/admin",
  );
  expect(layout).toMatchObject({
    path: "/admin",
    id: "routes/admin",
    parentId: "routes/root",
  });
  expect(layout).not.toHaveProperty("index");
  expect(index).toMatchObject({ id: "routes/admin._index", index: true });
  expect(Object.keys(await index.lazy!()).sort()).toEqual(["default", "meta"]);
});
