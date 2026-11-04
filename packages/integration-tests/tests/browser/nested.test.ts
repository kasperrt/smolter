import { configureApplication } from "@smolter/core/environment";
import * as preact from "@smolter/preact/nested";
import * as react from "@smolter/react/nested";
import {
  createElement as preactElement,
  useState as preactState,
} from "preact/compat";
import { createRoot as preactRoot } from "preact/compat/client";
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { deferred } from "../helpers/deferred";

const frameworks = [
  {
    name: "React",
    api: react,
    h: createElement,
    mount: createRoot,
    state: useState,
  },
  {
    name: "Preact",
    api: preact as unknown as typeof react,
    h: preactElement as typeof createElement,
    mount: preactRoot as typeof createRoot,
    state: preactState as typeof useState,
  },
];
for (const { name, api, h, mount, state } of frameworks) {
  for (const enabled of [false, true]) {
    it(`${name} lets consumers own route commits (${enabled})`, async (context) => {
      const transition = vi.spyOn(document, "startViewTransition");
      function One() {
        return h("h1", null, "One");
      }
      function Two() {
        return h("h1", null, "Two");
      }
      const router = api.createNestedRouter([
        { id: "one", path: "/one", default: One },
        { id: "two", path: "/two", default: Two },
      ]);
      if (enabled)
        configureApplication({
          commitRoute(commit, previous, next) {
            if (!previous.loaded || previous.url === next.url) {
              commit();
              return;
            }
            document.startViewTransition(commit);
          },
        });
      const container = document.createElement("div");
      document.body.append(container);
      const root = mount(container);
      context.onTestFinished(() => {
        configureApplication({});
        transition.mockRestore();
        root.unmount();
        router.dispose();
        container.remove();
      });
      await router.navigate("/one");
      root.render(h(api.RouterProvider, { router }, h(api.NestedRoutes)));
      await expect.poll(() => container.textContent).toBe("One");
      await router.navigate("/two");
      await expect.poll(() => container.textContent).toBe("Two");
      expect(transition).toHaveBeenCalledTimes(enabled ? 1 : 0);
      transition.mockClear();
      configureApplication({});
      await router.navigate("/one");
      await expect.poll(() => container.textContent).toBe("One");
      expect(transition).not.toHaveBeenCalled();
    });
  }
  it(`${name} keeps loader-free layouts mounted around the pending child skeleton`, async (context) => {
    const pending = deferred<string>();
    function Layout() {
      return h("main", null, h("input"), h(api.Outlet));
    }
    function Page() {
      return h("h1", null, api.useLoaderData<string>());
    }
    const router = api.createNestedRouter([
      {
        id: "root",
        path: "/",
        default: Layout,
        HydrateFallback: () => h("p", null, "Generic root loading"),
      },
      {
        id: "page",
        path: "/page",
        parentId: "root",
        default: Page,
        clientLoader: () => pending.promise,
        HydrateFallback: () => h("h1", null, "Page skeleton"),
      },
    ]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    const navigation = router.navigate("/page");
    root.render(h(api.RouterProvider, { router }, h(api.NestedRoutes)));
    await expect.poll(() => container.textContent).toBe("Page skeleton");
    const input = container.querySelector("input")!;
    input.value = "retained";
    input.focus();
    pending.resolve("Ready");
    await navigation;
    await expect.poll(() => container.textContent).toBe("Ready");
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("retained");
    expect(document.activeElement).toBe(input);
  });
  it(`${name} retains layout state, focus and input across children and exclusive revalidation`, async (context) => {
    let reads = 0;
    let childReads = 0;
    let allow = true;
    const pending = deferred<string>();
    function Parent() {
      const [count, setCount] = state(0);
      return h(
        "main",
        null,
        h("input", { "aria-label": "Retained input" }),
        h("button", { onClick: () => setCount(count + 1) }, String(count)),
        h("output", { id: "parent" }, api.useLoaderData<number>()),
        h(api.Outlet),
      );
    }
    function Child() {
      return h("h1", null, api.useLoaderData<string>());
    }
    const router = api.createNestedRouter([
      {
        id: "parent",
        path: "/",
        default: Parent,
        clientLoader: () => ++reads,
        shouldRevalidate: ({ reason }) => allow && reason !== "navigation",
      },
      {
        id: "one",
        parentId: "parent",
        path: "/one",
        default: Child,
        clientLoader: () => {
          childReads++;
          return "One";
        },
      },
      {
        id: "two",
        parentId: "parent",
        path: "/two",
        default: Child,
        clientLoader: () => {
          childReads++;
          return pending.promise;
        },
      },
    ]);
    await router.navigate("/one");
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(h(api.RouterProvider, { router }, h(api.NestedRoutes)));
    await expect
      .poll(() => container.querySelector("h1")?.textContent)
      .toBe("One");
    const input = container.querySelector("input")!;
    input.value = "retained";
    input.focus();
    container.querySelector("button")!.click();
    await expect
      .poll(() => container.querySelector("button")!.textContent)
      .toBe("1");
    const navigation = router.navigate("/two");
    expect(container.querySelector("input")).toBe(input);
    pending.resolve("Two");
    await navigation;
    await expect
      .poll(() => container.querySelector("h1")?.textContent)
      .toBe("Two");
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("retained");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector("button")!.textContent).toBe("1");
    await router.revalidate({ route: "parent" });
    await expect
      .poll(() => container.querySelector("#parent")?.textContent)
      .toBe("2");
    expect(childReads).toBe(2);
    allow = false;
    await router.revalidate({ route: "parent" });
    expect(reads).toBe(2);
  });
  it(`${name} scopes forms, fetchers, metadata and errors to their layouts`, async (context) => {
    let parentWrites = 0;
    let childWrites = 0;
    let childReads = 0;
    let fetcher: ReturnType<typeof api.useFetcher<string>> | undefined;
    let submit: ReturnType<typeof api.useSubmit> | undefined;
    function Parent() {
      return h(
        "main",
        null,
        h(
          api.Form,
          { id: "parent-form", method: "post" },
          h("button", null, "Parent save"),
        ),
        h(api.Outlet, { context: "shared" }),
      );
    }
    function Child() {
      fetcher = api.useFetcher<string>();
      submit = api.useSubmit();
      return h(
        "section",
        null,
        h("output", { id: "context" }, api.useOutletContext<string>()),
        h(
          "output",
          { id: "ancestor" },
          api.useRouteLoaderData<string>("parent"),
        ),
        h(
          "output",
          { id: "matches" },
          api
            .useMatches({ pending: true })
            .map((match) => match.id)
            .join(","),
        ),
        h("output", { id: "action" }, api.useActionData<number>()),
        h(
          fetcher.Form,
          { id: "child-form", method: "post" },
          h("button", null, "Child save"),
        ),
      );
    }
    function Boundary() {
      return h("h2", null, api.useRouteError()?.message);
    }
    function Broken() {
      throw new Error("render failure");
    }
    const router = api.createNestedRouter([
      {
        id: "parent",
        path: "/item/:id",
        default: Parent,
        clientLoader: () => "account",
        clientAction: () => ++parentWrites,
        ErrorBoundary: Boundary,
      },
      {
        id: "index",
        path: "/item/:id",
        parentId: "parent",
        index: true,
        default: Child,
        clientLoader: () => `read ${++childReads}`,
        clientAction: () => ++childWrites,
        meta: () => [
          { title: "Nested fixture" },
          { name: "description", content: "Owned metadata" },
          {
            tagName: "link",
            rel: "canonical",
            href: "https://fixture.test/item/42",
          },
        ],
      },
      {
        id: "bad",
        path: "/bad",
        parentId: "parent",
        clientLoader: () => new Error("loader failure"),
        default: Child,
      },
      { id: "render", path: "/render", parentId: "parent", default: Broken },
    ]);
    await router.navigate("/item/42");
    const container = document.createElement("div");
    document.body.append(container);
    const root = mount(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(h(api.RouterProvider, { router }, h(api.Outlet)));
    await expect
      .poll(() => container.querySelector("#context")?.textContent)
      .toBe("shared");
    expect(container.querySelector("#ancestor")?.textContent).toBe("account");
    expect(container.querySelector("#matches")?.textContent).toBe(
      "parent,index",
    );
    await expect.poll(() => document.title).toBe("Nested fixture");
    expect(
      document.head
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe("Owned metadata");
    await fetcher!.load();
    expect(fetcher!.data).toBe("read 2");
    await fetcher!.submit(new FormData());
    expect(childWrites).toBe(1);
    const form = container.querySelector<HTMLFormElement>("#child-form")!;
    form.requestSubmit();
    await expect.poll(() => childWrites).toBe(2);
    await expect.poll(() => fetcher!.state).toBe("idle");
    await submit!(new FormData(), { method: "post" });
    expect(childWrites).toBe(3);
    await expect
      .poll(() => container.querySelector("#action")?.textContent)
      .toBe("3");
    container.querySelector<HTMLFormElement>("#parent-form")!.requestSubmit();
    await expect.poll(() => parentWrites).toBe(1);
    await expect.poll(() => router.getSnapshot().state).toBe("idle");
    await router.navigate("/bad");
    await expect
      .poll(() => container.querySelector("h2")?.textContent)
      .toBe("loader failure");
    await router.navigate("/render");
    await expect
      .poll(() => container.querySelector("h2")?.textContent)
      .toBe("render failure");
    await router.navigate("/item/42");
    await expect
      .poll(() => container.querySelector("#context")?.textContent)
      .toBe("shared");
  });
}
