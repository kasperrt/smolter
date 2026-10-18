import { serverRoute, watchDeployment } from "@smolter/client";
import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { createElement as preactElement } from "preact/compat";
import { createRoot as preactRoot } from "preact/compat/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

for (const { name, api, h, mount } of [
  { name: "React", api: react, h: createElement, mount: createRoot },
  {
    name: "Preact",
    api: preact as unknown as typeof react,
    h: preactElement as typeof createElement,
    mount: preactRoot as typeof createRoot,
  },
]) {
  it(`${name} prefetches scoped data on viewport entry, reuses it on click, and keeps defaults code-only`, async (context) => {
    const requests: string[] = [];
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        requests.push(String(input));
        return Response.json({ message: "Prefetched" });
      });
    const preload = vi.fn(async () => {});
    const router = api.createDataRouter(
      [
        { path: "/" },
        api.defineRoute("/item", {
          ...serverRoute(
            "/item",
            {},
            { loader: true, dataEndpoint: "/admin/_smolter" },
          ),
          preload,
        }),
      ],
      {},
    );
    await router.navigate("/");
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
      fetch.mockRestore();
    });
    const render = (
      prefetch: react.LinkProps["prefetch"],
      prefetchData: boolean,
      top: string,
      to = "/item?q=1#scope",
    ) =>
      root.render(
        h(
          api.RouterProvider,
          { router },
          h(
            api.Link,
            { to, prefetch, prefetchData, style: { position: "fixed", top } },
            "Next",
          ),
        ),
      );
    render("viewport", true, "200vh");
    await expect.poll(() => container.querySelector("a")).toBeTruthy();
    // Let the observer deliver its initial offscreen observation.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(requests).toEqual([]);
    expect(preload).not.toHaveBeenCalled();
    render("viewport", true, "0px");
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toBe("/admin/_smolter?url=%2Fitem%3Fq%3D1");
    expect(router.getSnapshot().url).toBe("http://localhost/");
    container.querySelector("a")!.click();
    await expect
      .poll(() => router.getSnapshot().data)
      .toEqual({ message: "Prefetched" });
    expect(router.getSnapshot().url).toBe("http://localhost/item?q=1#scope");
    expect(requests).toHaveLength(1);
    render(undefined, false, "0px", "/item?q=2");
    await expect.poll(() => container.querySelector("a")?.search).toBe("?q=2");
    container.querySelector("a")!.focus();
    await expect.poll(() => preload.mock.calls.length).toBe(2);
    expect(requests).toHaveLength(1);
    render("intent", true, "0px", "/item?q=3");
    await expect.poll(() => container.querySelector("a")?.search).toBe("?q=3");
    container.querySelector("a")!.blur();
    container.querySelector("a")!.focus();
    await expect.poll(() => requests.length).toBe(2);
    container.querySelector("a")!.click();
    await expect
      .poll(() => router.getSnapshot().url)
      .toBe("http://localhost/item?q=3");
    expect(requests).toHaveLength(2);
  });

  it(`${name} skips disabled, document-reload and external viewport links`, async (context) => {
    const loader = vi.fn();
    const preload = vi.fn(async () => {});
    const router = api.createDataRouter(
      [api.defineRoute("/item", { loader, preload })],
      {},
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(
      h(
        api.RouterProvider,
        { router },
        h(
          api.Link,
          { to: "/item", prefetch: "none", prefetchData: true },
          "Disabled",
        ),
        h(
          api.Link,
          {
            to: "/item",
            prefetch: "viewport",
            prefetchData: true,
            reloadDocument: true,
          },
          "Document",
        ),
        h(
          api.Link,
          {
            to: "https://outside.test/item",
            prefetch: "viewport",
            prefetchData: true,
          },
          "External",
        ),
      ),
    );
    await expect.poll(() => container.querySelectorAll("a").length).toBe(3);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(loader).not.toHaveBeenCalled();
    expect(preload).not.toHaveBeenCalled();
  });

  it(`${name} leaves speculative failures out of recovery and retries at the committed destination`, async (context) => {
    const loader = vi
      .fn()
      .mockImplementationOnce(() => {
        window.dispatchEvent(new Event("vite:preloadError"));
        return Error("missing chunk");
      })
      .mockResolvedValue("retried");
    const router = api.createDataRouter(
      [{ path: "/" }, { path: "/item", loader }],
      { url: location.origin + "/" },
    );
    await router.navigate("/");
    const reload = vi.fn();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ version: "same" }));
    watchDeployment(router, {
      version: "same",
      manifestURL: "/manifest.json",
      reload,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
      fetch.mockRestore();
    });
    root.render(
      h(
        api.RouterProvider,
        { router },
        h(
          api.Link,
          { to: "/item", prefetch: "viewport", prefetchData: true },
          "Next",
        ),
      ),
    );
    await expect.poll(() => loader.mock.calls.length).toBe(1);
    expect(router.getSnapshot()).toMatchObject({
      url: location.origin + "/",
      error: undefined,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    container.querySelector("a")!.click();
    await expect.poll(() => router.getSnapshot().data).toBe("retried");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
}
