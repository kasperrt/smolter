import type { DiscoveredRoute } from "@smolter/core";
import { useLoaderData } from "@smolter/react";
import { mountApplication } from "@smolter/react/client";
import { routeDiscoveryClient } from "@smolter/react/discovery";
import { createElement } from "react";
import { expect, it, vi } from "vitest";

const protectedRoute: DiscoveredRoute = {
  path: "/protected",
  capabilities: {},
  file: new URL("./fixtures/protected-route.ts", import.meta.url).href,
  exports: ["default", "clientLoader"],
  styles: [],
};

it("discovers protected deep links and navigations in React, and forgets them after a permission change", async (context) => {
  const original = location.href;
  const container = document.createElement("div");
  let authorized = true;
  const requests: string[] = [];
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      requests.push(String(input));
      return authorized && String(input) === "/protected.__smolter-routes"
        ? Response.json({ build: "build-1", routes: [protectedRoute] })
        : Response.json({ routes: [] }, { status: 404 });
    });
  container.id = "root";
  document.body.append(container);
  history.replaceState(null, "", "/protected");
  function Page() {
    return createElement("output", null, useLoaderData<string>());
  }
  const router = await mountApplication(
    [{ path: "/public", loader: () => "Public page", default: Page }],
    undefined,
    { discover: routeDiscoveryClient("build-1") },
  );
  context.onTestFinished(() => {
    router.dispose();
    container.remove();
    fetch.mockRestore();
    history.replaceState(null, "", original);
  });
  await expect.poll(() => container.textContent).toBe("Protected page");
  expect(requests).toEqual(["/protected.__smolter-routes"]);
  await router.navigate("/public");
  await expect.poll(() => container.textContent).toBe("Public page");
  await router.navigate("/protected");
  await expect.poll(() => container.textContent).toBe("Protected page");
  expect(requests).toHaveLength(1);
  // Logging out: the app resets discovery, so the next visit asks again and is denied.
  authorized = false;
  router.resetDiscovery!();
  await router.navigate("/public");
  await router.navigate("/protected");
  expect(router.getSnapshot().error?.message).toBe("No route");
  expect(requests).toHaveLength(2);
  expect(router.routes.map((route) => route.path)).toEqual(["/public"]);
});
