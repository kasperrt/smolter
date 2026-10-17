import { expect, it } from "vitest";
import type { AppRoute } from "../packages/preact/src/route-types.ts";
import {
  dispatchRoute,
  renderApplication,
} from "../packages/server/src/application.tsx";
import { routePreloads } from "../packages/server/src/assets.ts";

for (const mode of ["document", "data"]) {
  it(`${mode} HEAD requests read resource loaders without invoking actions`, async () => {
    let reads = 0;
    let writes = 0;
    const routes: AppRoute[] = [
      {
        path: "/resource",
        loader: () => {
          reads++;

          return new Response("Read result", {
            headers: { "X-Resource-Version": "1" },
          });
        },
        action: () => {
          writes++;

          return "Mutation result";
        },
      },
    ];
    const request = new Request("http://local/resource", { method: "HEAD" });
    const response =
      mode === "document"
        ? await renderApplication(
            request,
            routes,
            { default: () => null, Layout: () => null },
            "/entry.js",
          )
        : await dispatchRoute(request, routes);

    expect(reads).toBe(1);
    expect(writes).toBe(0);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Resource-Version")).toBe("1");
    await response.body?.cancel();
  });
}

it("preloads only the first matching route's files under the configured asset base", () => {
  const routes = [
    {
      path: "/items/new",
      files: ["assets/new.js"],
      styles: ["assets/new.css"],
    },
    { path: "/items/:id", files: ["assets/item.js", "assets/shared.js"] },
    { path: "/empty", files: [] },
  ];

  expect(routePreloads(routes, "/items/new", "/app/")).toBe(
    "</app/assets/new.css>; rel=preload; as=style, </app/assets/new.js>; rel=modulepreload",
  );
  expect(routePreloads(routes, "/items/42", "https://cdn.example/app/")).toBe(
    "<https://cdn.example/app/assets/item.js>; rel=modulepreload, <https://cdn.example/app/assets/shared.js>; rel=modulepreload",
  );
  expect(routePreloads(routes, "/empty", "/")).toBe("");
  expect(routePreloads(routes, "/missing", "/")).toBe("");
});
