import { createDataRouter } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { createElement as preactElement } from "preact/compat";
import { createRoot as preactRoot } from "preact/compat/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { deferred } from "../helpers/deferred.ts";

for (const { name, api, h, mount } of [
  { name: "React", api: react, h: createElement, mount: createRoot },
  {
    name: "Preact",
    api: preact as unknown as typeof react,
    h: preactElement as typeof createElement,
    mount: preactRoot as typeof createRoot,
  },
]) {
  it(`${name} reports page pending destinations and NavLink state separately from fetchers`, async (context) => {
    const loading = deferred<string>();
    const independent = deferred<string>();
    const router = createDataRouter([
      { path: "/", loader: () => "home" },
      { path: "/next", loader: () => loading.promise },
      { path: "/independent", loader: () => independent.promise },
    ]);
    await router.navigate("/");
    const root = mount(document.createElement("div"));
    let navigation: ReturnType<typeof api.useNavigation> | undefined;
    let link: react.NavLinkRenderProps | undefined;
    let alias: react.NavLinkRenderProps | undefined;
    let external: react.NavLinkRenderProps | undefined;
    configureApplication({
      resolveURL(url) {
        if (url.pathname === "/alias") url.pathname = "/next";
        return url;
      },
    });
    function Probe() {
      navigation = api.useNavigation();
      return h(
        "div",
        null,
        h(api.NavLink, {
          to: "/next",
          children: (state) => {
            link = state;
            return "Next";
          },
        }),
        h(api.NavLink, {
          to: "/alias",
          children: (state) => {
            alias = state;
            return "Alias";
          },
        }),
        h(api.NavLink, {
          to: "https://outside.test/next",
          children: (state) => {
            external = state;
            return "External";
          },
        }),
      );
    }
    context.onTestFinished(() => {
      loading.resolve("done");
      independent.resolve("done");
      root.unmount();
      router.dispose();
      configureApplication({});
    });
    root.render(h(api.RouterProvider, { router }, h(Probe)));
    await expect.poll(() => navigation?.state).toBe("idle");
    const fetcher = router.createFetcher();
    const read = fetcher.load("/independent");
    expect(navigation?.state).toBe("idle");
    expect(link?.isPending).toBe(false);
    const next = router.navigate("/next?q=1#section");
    await expect
      .poll(() => navigation?.location?.href)
      .toBe("http://localhost/next?q=1#section");
    await expect.poll(() => link?.isPending).toBe(true);
    expect(alias?.isPending).toBe(true);
    expect(external).toEqual({ isActive: false, isPending: false });
    loading.resolve("done");
    await next;
    await expect.poll(() => navigation?.state).toBe("idle");
    expect(navigation?.location).toBeUndefined();
    expect(link?.isPending).toBe(false);
    expect(alias?.isActive).toBe(true);
    expect(external?.isActive).toBe(false);
    independent.resolve("done");
    await read;
    fetcher.dispose();
  });
}
