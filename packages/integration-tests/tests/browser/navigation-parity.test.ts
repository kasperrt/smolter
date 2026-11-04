import { createDataRouter } from "@smolter/core";
import { configureApplication } from "@smolter/core/environment";
import { connectNavigation } from "@smolter/core/navigation";
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
  it(`${name} search readers ignore history-only changes and follow the active pathname`, async (context) => {
    const initialState = history.state;
    const router = createDataRouter(
      [{ path: location.pathname }, { path: "/search-other" }],
      { url: location.href },
    );
    connectNavigation(router);
    const root = mount(document.createElement("div"));
    let renders = 0;
    let search: ReturnType<typeof api.useSearchParams> | undefined;
    let historyState: unknown;
    function Probe() {
      renders++;
      search = api.useSearchParams();
      return null;
    }
    function HistoryProbe() {
      historyState = api.useURLLocation().state;
      return null;
    }
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      history.replaceState(initialState, "", location.href);
    });
    root.render(h(api.RouterProvider, { router }, h(Probe), h(HistoryProbe)));
    await expect.poll(() => renders).toBe(1);
    const initialSearch = search;
    await router.navigate(location.href, { state: { visit: 2 } });
    await expect.poll(() => historyState).toEqual({ visit: 2 });
    expect(renders).toBe(1);
    expect(search).toBe(initialSearch);
    await router.navigate("/search-other?tag=first&tag=second#scope");
    await expect
      .poll(() => search?.[0].getAll("tag"))
      .toEqual(["first", "second"]);
    search?.[1]({ mode: "watch" }, { replace: true, state: { visit: 3 } });
    await expect
      .poll(() => router.getSnapshot().url)
      .toBe(`${location.origin}/search-other?mode=watch`);
    expect(history.state.state).toEqual({ visit: 3 });
    await expect.poll(() => search?.[0].get("mode")).toBe("watch");
  });
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
