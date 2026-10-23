import { configureApplication } from "@smolter/core/environment";
import { createStore } from "@smolter/core/store";
import {
  type FormSubmissionEvent,
  submissionBody,
  submitForm,
} from "@smolter/core/submission";
import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { createElement as preactElement } from "preact/compat";
import { createRoot as preactRoot } from "preact/compat/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { deferred } from "../helpers/deferred";

const frameworks = [
  { name: "React", api: react, element: createElement, root: createRoot },
  {
    name: "Preact",
    api: preact as unknown as typeof react,
    element: preactElement as typeof createElement,
    root: preactRoot as typeof createRoot,
  },
];

for (const { name, api, element: h, root: mount } of frameworks) {
  it(`${name} keeps the application shell stable during route updates`, async (context) => {
    const pending = deferred<string>();
    let rootRenders = 0;
    const rootStore = createStore("initial root");
    function Page() {
      return h("output", { id: "page" }, api.useLoaderData<string>());
    }
    function LocalError() {
      return h("output", { id: "page" }, api.useRouteError()?.message);
    }
    function RootError() {
      return h("output", { id: "root-error" }, api.useRouteError()?.message);
    }
    function Root() {
      rootRenders++;
      return h(
        "main",
        null,
        h("input", { defaultValue: "retained" }),
        h("output", { id: "root-data" }, api.useRootData<string>()),
        h(api.Outlet),
      );
    }
    const routes = [
      { path: "/", default: Page, loader: () => "initial" },
      { path: "/next", default: Page, loader: () => pending.promise },
      {
        path: "/local-error",
        default: Page,
        loader: () => new Error("local failure"),
        ErrorBoundary: LocalError,
      },
      { path: "/root-error", loader: () => new Error("root failure") },
    ];
    const router = api.createDataRouter(routes);
    await router.navigate("/");
    const container = document.createElement("div");
    const root = mount(container);
    document.body.append(container);
    context.onTestFinished(() => {
      pending.resolve("next");
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(
      h(api.RouterApplication, {
        router,
        routes,
        root: "initial root",
        rootStore,
        rootModule: {
          default: Root,
          ErrorBoundary: RootError,
          Layout: api.Outlet,
        },
      }),
    );
    await expect
      .poll(() => container.querySelector("#page")?.textContent)
      .toBe("initial");
    const initialRenders = rootRenders;
    const input = container.querySelector("input")!;
    input.value = "user input";
    const navigation = router.navigate("/next");
    await new Promise(requestAnimationFrame);
    if (name === "React") expect(rootRenders).toBe(initialRenders);
    pending.resolve("next");
    await navigation;
    await expect
      .poll(() => container.querySelector("#page")?.textContent)
      .toBe("next");
    if (name === "React") expect(rootRenders).toBe(initialRenders);
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("user input");
    rootStore.update("refreshed root");
    await expect
      .poll(() => container.querySelector("#root-data")?.textContent)
      .toBe("refreshed root");
    const refreshedRenders = rootRenders;
    await router.navigate("/local-error");
    await expect
      .poll(() => container.querySelector("#page")?.textContent)
      .toBe("local failure");
    if (name === "React") expect(rootRenders).toBe(refreshedRenders);
    expect(container.querySelector("input")).toBe(input);
    await router.navigate("/root-error");
    await expect
      .poll(() => container.querySelector("#root-error")?.textContent)
      .toBe("root failure");
    expect(container.querySelector("main")).toBeNull();
  });
  it(`${name} only rerenders readers when their selected value changes`, async (context) => {
    let value = 1;
    let dataRenders = 0;
    let locationRenders = 0;
    let pageRenders = 0;
    let paramsRenders = 0;
    const route = api.defineRoute("/items/:id", {
      loader: () => value,
      shouldRevalidate: ({ reason }) => reason !== "navigation",
      default: Page,
    });
    const router = api.createDataRouter([route]);
    const container = document.createElement("div");
    const root = mount(container);
    document.body.append(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    function Page() {
      pageRenders++;
      return h(
        "section",
        null,
        h(DataReader),
        h(LocationReader),
        h(ParamsReader),
      );
    }
    function DataReader() {
      const data = api.useLoaderData(route);
      dataRenders++;
      return h("output", { id: "selected-data" }, data);
    }
    function LocationReader() {
      const [location] = api.useLocation();
      locationRenders++;
      return h("output", { id: "selected-location" }, location);
    }
    function ParamsReader() {
      const params = api.useParams();
      paramsRenders++;
      return h("output", { id: "selected-params" }, params.id);
    }
    await router.navigate("/items/1");
    root.render(h(api.RouterProvider, { router }, h(api.Routes)));
    await expect
      .poll(() => container.querySelector("#selected-data")?.textContent)
      .toBe("1");
    const initialPageRenders = pageRenders;
    const initialDataRenders = dataRenders;
    const initialLocationRenders = locationRenders;
    const initialParamsRenders = paramsRenders;
    await router.revalidate();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    expect(pageRenders).toBe(initialPageRenders);
    expect(dataRenders).toBe(initialDataRenders);
    expect(locationRenders).toBe(initialLocationRenders);
    expect(paramsRenders).toBe(initialParamsRenders);
    value = 2;
    await router.revalidate();
    await expect
      .poll(() => container.querySelector("#selected-data")?.textContent)
      .toBe("2");
    expect(pageRenders).toBe(initialPageRenders);
    expect(dataRenders).toBe(initialDataRenders + 1);
    expect(locationRenders).toBe(initialLocationRenders);
    expect(paramsRenders).toBe(initialParamsRenders);
    await router.navigate("/items/2");
    await expect
      .poll(() => container.querySelector("#selected-params")?.textContent)
      .toBe("2");
    expect(pageRenders).toBe(initialPageRenders);
    expect(paramsRenders).toBe(initialParamsRenders + 1);
  });
  it(`${name} preserves a loaded page whose loader returns undefined`, async (context) => {
    const initial = deferred<void>();
    const refresh = deferred<void>();
    let reads = 0;
    const router = api.createDataRouter(
      [
        api.defineRoute("/empty", {
          loader: () => [initial.promise, refresh.promise][reads++],
          shouldRevalidate: ({ reason }) => reason !== "navigation",
          default: () => h("input", { "aria-label": "Kept input" }),
          HydrateFallback: () => h("p", null, "Loading empty page"),
        }),
      ],
      { url: "/empty" },
    );
    const container = document.createElement("div");
    const root = mount(container);
    document.body.append(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(h(api.RouterProvider, { router }, h(api.Routes)));
    await expect.poll(() => container.textContent).toBe("Loading empty page");
    initial.resolve();
    await expect.poll(() => container.querySelector("input")).not.toBeNull();
    const input = container.querySelector("input")!;
    input.value = "Keep this value";
    const pending = router.revalidate();
    await expect.poll(() => reads).toBe(2);
    await new Promise(requestAnimationFrame);
    expect(container.querySelector("input")).toBe(input);
    expect(container.textContent).not.toContain("Loading empty page");
    refresh.resolve();
    await pending;
    await router.navigate("/empty?view=compact");
    await new Promise(requestAnimationFrame);
    expect(reads).toBe(2);
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Keep this value");
  });
  it(`${name} connects data hooks, forms, links, and independent fetchers`, async (context) => {
    let count = 0;
    let fetcher: ReturnType<typeof api.useFetcher>;
    let revalidate: ReturnType<typeof api.useRevalidator>;
    const route = api.defineRoute("/tasks/:id", {
      loader: () => count,
      action: async ({ request }) => {
        const body = await request.formData();
        count += Number(body.get("amount"));
        return { count, method: request.method };
      },
      default: () => h("strong", null, "Task view"),
    });
    const other = api.defineRoute("/other", { loader: () => "Other" });
    const router = api.createDataRouter([route, other], { url: "/tasks/42" });
    const container = document.createElement("div");
    const root = mount(container);
    document.body.append(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    function Screen() {
      const data = api.useLoaderData(route);
      const action = api.useActionData(route);
      const params = api.useParams();
      const [location] = api.useLocation();
      const foreign = api.useLoaderData(other);
      fetcher = api.useFetcher(route);
      revalidate = api.useRevalidator();
      return h(
        "section",
        null,
        h(
          "output",
          { id: "state" },
          JSON.stringify({ data, action, params, location, foreign }),
        ),
        h(api.Routes, { fallback: "No component" }),
        h(api.Link, { href: "/other", id: "next" }, "Other"),
        h(
          api.Link,
          {
            href: "/other",
            id: "cancelled",
            onClick: (event) => event.preventDefault(),
          },
          "Stay",
        ),
        h(
          api.Form,
          { action: "/tasks/42", method: "patch", id: "page-form" },
          h("button", { name: "amount", value: "2", type: "submit" }, "Save"),
        ),
        h(
          fetcher.Form,
          { id: "fetcher-form" },
          h("button", { name: "amount", value: "3", type: "submit" }, "Add"),
        ),
        h(
          api.Form,
          { action: "/tasks/42", method: "get", id: "search-form" },
          h("input", { name: "q", value: "hello", readOnly: true }),
          h("input", { name: "q", value: "again", readOnly: true }),
          h("input", { name: "attachment", type: "file" }),
          h("button", { type: "submit" }, "Search"),
        ),
      );
    }
    root.render(h(api.RouterProvider, { router }, h(Screen)));
    await expect.poll(() => container.textContent).toContain('"data":0');
    expect(container.textContent).toContain('"id":"42"');
    expect(container.textContent).not.toContain('"foreign"');
    container.querySelector<HTMLAnchorElement>("#cancelled")!.click();
    expect(router.getSnapshot().url).toBe("http://localhost/tasks/42");
    container.querySelector<HTMLButtonElement>("#page-form button")!.click();
    await expect
      .poll(() => router.getSnapshot().actionData)
      .toEqual({ count: 2, method: "PATCH" });
    await expect.poll(() => container.textContent).toContain('"data":2');
    expect(
      container.querySelector<HTMLFormElement>("#fetcher-form")!.method,
    ).toBe("post");
    container.querySelector<HTMLButtonElement>("#fetcher-form button")!.click();
    await expect.poll(() => fetcher.data).toEqual({ count: 5, method: "POST" });
    await expect.poll(() => container.textContent).toContain('"data":5');
    await fetcher!.load();
    await expect.poll(() => fetcher.data).toBe(5);
    const body = new FormData();
    body.set("amount", "4");
    await fetcher!.submit(body, { method: "PUT" });
    await expect.poll(() => fetcher.data).toEqual({ count: 9, method: "PUT" });
    body.set("amount", "0");
    await fetcher!.submit(body);
    await expect.poll(() => fetcher.data).toEqual({ count: 9, method: "POST" });
    await revalidate!();
    await expect.poll(() => container.textContent).toContain('"data":9');
    const upload = new DataTransfer();
    upload.items.add(
      new File(["example"], "notes.txt", { type: "text/plain" }),
    );
    container.querySelector<HTMLInputElement>(
      "#search-form input[type=file]",
    )!.files = upload.files;
    container.querySelector<HTMLButtonElement>("#search-form button")!.click();
    await expect.poll(() => router.getSnapshot().url).toContain("?q=hello");
    const search = new URL(router.getSnapshot().url).searchParams;
    expect(search.getAll("q")).toEqual(["hello", "again"]);
    expect(search.get("attachment")).toBe("notes.txt");
    container.querySelector<HTMLAnchorElement>("#next")!.click();
    await expect.poll(() => container.textContent).toContain("No component");
    expect(router.getSnapshot().data).toBe("Other");
  });
}

for (const { name, api, element: h, root: mount } of frameworks) {
  it(
    name + " selects loading, boundary, error, and missing-view fallbacks",
    async (context) => {
      const pending = deferred<string | Error>();
      const router = api.createDataRouter([
        api.defineRoute("/ready", { loader: () => "Ready", default: Page }),
        api.defineRoute("/pending", {
          loader: () => pending.promise,
          default: Page,
          HydrateFallback: Loading,
          ErrorBoundary: ErrorView,
        }),
        api.defineRoute("/plain", {
          loader: () => new Error("Plain error"),
          default: Page,
        }),
        api.defineRoute("/missing-view", { loader: () => "Hidden data" }),
      ]);
      const container = document.createElement("div");
      const root = mount(container);
      function Page() {
        return h("p", null, String(api.useLoaderData()));
      }
      function Loading() {
        return h("p", null, "Loading");
      }
      function ErrorView({ error }: react.ErrorProps) {
        return h("p", null, "Boundary: " + error.message);
      }
      document.body.append(container);
      context.onTestFinished(() => {
        root.unmount();
        router.dispose();
        container.remove();
      });
      await router.navigate("/ready");
      root.render(
        h(
          api.RouterProvider,
          { router },
          h(api.Routes, { fallback: "Missing view" }),
        ),
      );
      await expect.poll(() => container.textContent).toBe("Ready");
      const navigation = router.navigate("/pending");
      await expect.poll(() => container.textContent).toBe("Loading");
      pending.resolve(new Error("Route failed"));
      await navigation;
      await expect
        .poll(() => container.textContent)
        .toBe("Boundary: Route failed");
      await router.navigate("/plain");
      await expect.poll(() => container.textContent).toBe("Plain error");
      await router.navigate("/missing-view");
      await expect.poll(() => container.textContent).toBe("Missing view");
    },
  );
}

it("integrates browser history and cancels in-flight work on disposal", async (context) => {
  const original = window.location.href;
  let finish: (value: string) => void = () => {};
  let signal: AbortSignal | undefined;
  const router = react.createDataRouter(
    [
      react.defineRoute("/history-a", { loader: () => "A" }),
      react.defineRoute("/history-b", { loader: () => "B" }),
      react.defineRoute("/history-slow", {
        loader: (args) => {
          signal = args.signal;
          return new Promise<string>((resolve) => {
            finish = resolve;
          });
        },
      }),
    ],
    { browser: true, url: new URL("/history-a", original).href },
  );
  const stop = router.start();
  context.onTestFinished(() => {
    stop();
    router.dispose();
    window.history.replaceState(null, "", original);
  });
  await router.navigate("/history-b");
  expect(window.location.pathname).toBe("/history-b");
  await router.navigate("/history-a", { replace: true });
  expect(window.location.pathname).toBe("/history-a");
  window.history.replaceState(null, "", "/history-b");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await expect.poll(() => router.getSnapshot().data).toBe("B");
  const pending = router.navigate("/history-slow");
  await expect.poll(() => signal).toBeDefined();
  router.dispose();
  expect(signal?.aborted).toBe(true);
  finish("Stale");
  await pending;
  expect(router.getSnapshot().data).not.toBe("Stale");
});

it("honors navigation revalidation for back and forward without adding history entries", async (context) => {
  const original = location.href;
  let reads = 0;
  const router = react.createDataRouter(
    [
      react.defineRoute("/history-items", {
        loader: () => ++reads,
        shouldRevalidate: () => false,
      }),
    ],
    { browser: true },
  );
  context.onTestFinished(() => {
    router.dispose();
    history.replaceState(null, "", original);
  });
  await router.navigate("/history-items?page=1");
  const stop = router.start();
  const entries = history.length;
  context.onTestFinished(stop);
  history.replaceState(null, "", "/history-items?page=2");
  dispatchEvent(new PopStateEvent("popstate"));
  await expect.poll(() => router.getSnapshot().state).toBe("idle");
  expect(router.getSnapshot().url).toBe(location.href);
  expect(router.getSnapshot().data).toBe(1);
  expect(reads).toBe(1);
  expect(history.length).toBe(entries);
});

it("Preact links keep resolved hrefs, prefetches, and clicks on the same route", async (context) => {
  let preloads = 0;
  const intents: string[] = [];
  const router = preact.createDataRouter(
    [
      preact.defineRoute("/items/one", {}),
      preact.defineRoute("/mapped", {
        loader: () => "Mapped",
        preload: async () => {
          preloads++;
        },
      }),
      preact.defineRoute("/other/one", {}),
      preact.defineRoute("/other/two", { loader: () => "Relative" }),
    ],
    { url: "/items/one" },
  );
  const container = document.createElement("div");
  const root = preactRoot(container);
  configureApplication({
    resolveURL(url) {
      if (url.pathname === "/items/two") url.pathname = "/mapped";
      return url;
    },
  });
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    configureApplication({});
  });
  function LocationReader() {
    return preactElement("output", null, preact.useURLLocation().href);
  }
  root.render(
    preactElement(
      preact.RouterProvider,
      { router },
      preactElement(LocationReader, null),
      preactElement(
        preact.Link,
        {
          to: "two",
          onFocus: (event) => intents.push(event.type),
          onPointerEnter: (event) => intents.push(event.type),
          onTouchStart: (event) => intents.push(event.type),
        },
        "Next",
      ),
    ),
  );
  await expect
    .poll(() => container.querySelector("a")?.href)
    .toBe("http://localhost/mapped");
  expect(container.querySelector("output")?.textContent).toBe(
    "http://localhost/items/one",
  );
  const anchor = container.querySelector("a")!;
  anchor.focus();
  anchor.dispatchEvent(new PointerEvent("pointerenter"));
  anchor.dispatchEvent(new TouchEvent("touchstart"));
  await expect.poll(() => preloads).toBe(3);
  expect(intents).toEqual(["focusin", "pointerenter", "touchstart"]);
  anchor.click();
  await expect.poll(() => router.getSnapshot().data).toBe("Mapped");
  await router.navigate("/other/one");
  await expect.poll(() => anchor.href).toBe("http://localhost/other/two");
  anchor.click();
  await expect.poll(() => router.getSnapshot().data).toBe("Relative");
  await expect
    .poll(() => container.querySelector("output")?.textContent)
    .toBe("http://localhost/other/two");
});

it("preserves repeated HTML form fields and leaves external form actions to the browser", () => {
  const form = document.createElement("form");
  for (const value of ["first", "second"]) {
    const input = document.createElement("input");
    input.name = "tag";
    input.value = value;
    form.append(input);
  }
  expect(submissionBody(form).getAll("tag")).toEqual(["first", "second"]);
  const router = react.createDataRouter([]);
  const snapshot = router.getSnapshot();
  form.addEventListener("submit", (event) => {
    const submission: FormSubmissionEvent = {
      currentTarget: form,
      defaultPrevented: event.defaultPrevented,
      preventDefault: () => event.preventDefault(),
    };
    submitForm(router, submission, event.submitter, {
      action: "https://other.example/submit",
    });
  });
  const event = new SubmitEvent("submit", { cancelable: true });
  form.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(router.getSnapshot()).toBe(snapshot);
  router.dispose();
});

it("Preact useSubmit preserves GET fields and defaults mutations to POST", async (context) => {
  const router = preact.createDataRouter([
    preact.defineRoute("/", {}),
    preact.defineRoute("/search", {
      loader: ({ request }) => [...new URL(request.url).searchParams],
      action: ({ request }) => request.method,
    }),
  ]);
  const container = document.createElement("div");
  const root = preactRoot(container);
  let submit: ReturnType<typeof preact.useSubmit> | undefined;
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });
  function Screen() {
    submit = preact.useSubmit();
    return null;
  }
  root.render(
    preactElement(
      preact.RouterProvider,
      { router },
      preactElement(Screen, null),
    ),
  );
  await expect.poll(() => typeof submit).toBe("function");
  const data = new FormData();
  data.append("tag", "one & two");
  data.append("tag", "+three");
  data.append("file", new File(["text"], "notes.txt"));
  await submit!(data, { method: "get", action: "/search" });
  expect(router.getSnapshot().data).toEqual([
    ["tag", "one & two"],
    ["tag", "+three"],
    ["file", "notes.txt"],
  ]);
  await submit!(data, { action: "/search" });
  expect(router.getSnapshot().actionData).toBe("POST");
});

interface LinkInteraction {
  name: string;
  attributes?: Partial<react.LinkProps>;
  mouse?: MouseEventInit;
  navigates: boolean;
  prevented: boolean;
}

const linkInteractions: LinkInteraction[] = [
  { name: "plain", navigates: true, prevented: true },
  {
    name: "self",
    attributes: { target: "_self" },
    navigates: true,
    prevented: true,
  },
  {
    name: "download",
    attributes: { download: "" },
    navigates: false,
    prevented: false,
  },
  {
    name: "target",
    attributes: { target: "preview" },
    navigates: false,
    prevented: false,
  },
  {
    name: "external",
    attributes: { href: "https://example.invalid/" },
    navigates: false,
    prevented: false,
  },
  {
    name: "cancelled",
    attributes: { onClick: (event) => event.preventDefault() },
    navigates: false,
    prevented: true,
  },
  ...["ctrlKey", "altKey", "shiftKey", "metaKey"].map((key) => ({
    name: key,
    mouse: { [key]: true },
    navigates: false,
    prevented: false,
  })),
  {
    name: "middle",
    mouse: { button: 1 },
    navigates: false,
    prevented: false,
  },
];

for (const { name, api, element: h, root: mount } of frameworks) {
  it(`${name} preserves browser link interactions`, async (context) => {
    let reads = 0;
    let prevented: boolean | undefined;
    const router = api.createDataRouter([
      api.defineRoute("/", {}),
      api.defineRoute("/next", { loader: () => ++reads }),
    ]);
    const container = document.createElement("div");
    const root = mount(container);
    const preventBrowserNavigation = (event: MouseEvent) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.body.append(container);
    document.addEventListener("click", preventBrowserNavigation);
    context.onTestFinished(() => {
      document.removeEventListener("click", preventBrowserNavigation);
      root.unmount();
      router.dispose();
      container.remove();
    });
    await router.navigate("/");
    root.render(
      h(
        api.RouterProvider,
        { router },
        ...linkInteractions.map((interaction) =>
          h(
            api.Link,
            {
              key: interaction.name,
              href: "/next",
              ...interaction.attributes,
              id: `link-case-${interaction.name}`,
            },
            interaction.name,
          ),
        ),
      ),
    );
    await expect
      .poll(() => container.querySelectorAll("a").length)
      .toBe(linkInteractions.length);
    let expectedReads = 0;
    for (const interaction of linkInteractions) {
      prevented = undefined;
      container.querySelector(`#link-case-${interaction.name}`)!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ...interaction.mouse,
        }),
      );
      expect(prevented, interaction.name).toBe(interaction.prevented);
      if (interaction.navigates) expectedReads++;
      await new Promise(requestAnimationFrame);
      expect(reads, interaction.name).toBe(expectedReads);
    }
  });
}

it("Preact prefetch opt-outs retain caller intent handlers", async (context) => {
  let preloads = 0;
  const callbacks: number[] = [];
  const router = preact.createDataRouter([
    preact.defineRoute("/", {}),
    preact.defineRoute("/next", {
      default: () => null,
      preload: async () => {
        preloads++;
      },
    }),
  ]);
  const modes: preact.LinkProps[] = [
    { href: "/next" },
    { href: "/next", prefetch: "none" },
    { href: "/next", reloadDocument: true },
    { href: "https://example.invalid/next" },
  ];
  const container = document.createElement("div");
  const root = preactRoot(container);
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });
  await router.navigate("/");
  root.render(
    preactElement(
      preact.RouterProvider,
      { router },
      ...modes.map((props, index) =>
        preactElement(
          preact.Link,
          {
            ...props,
            key: index,
            onFocus: () => callbacks.push(index),
            onPointerEnter: () => callbacks.push(index),
            onTouchStart: () => callbacks.push(index),
          },
          String(index),
        ),
      ),
    ),
  );
  await expect.poll(() => container.querySelectorAll("a").length).toBe(4);
  for (const anchor of container.querySelectorAll("a")) {
    anchor.focus();
    anchor.dispatchEvent(new PointerEvent("pointerenter"));
    anchor.dispatchEvent(new TouchEvent("touchstart"));
  }
  await expect.poll(() => preloads).toBe(3);
  expect(callbacks).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
});

it("Preact fetchers submit structured data to their selected route", async (context) => {
  const route = preact.defineRoute("/save", {
    action: async ({ request }) => ({
      method: request.method,
      fields: [...(await request.formData())],
    }),
  });
  const router = preact.createDataRouter([preact.defineRoute("/", {}), route]);
  const container = document.createElement("div");
  const root = preactRoot(container);
  let fetcher: ReturnType<typeof preact.useFetcher> | undefined;
  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });
  function Screen() {
    fetcher = preact.useFetcher(route);
    return null;
  }
  root.render(
    preactElement(
      preact.RouterProvider,
      { router },
      preactElement(Screen, null),
    ),
  );
  await expect.poll(() => fetcher).toBeDefined();
  await fetcher!.submit({ count: 3 });
  await expect
    .poll(() => fetcher!.data)
    .toEqual({
      method: "POST",
      fields: [["count", "3"]],
    });
  await fetcher!.submit(
    { nested: { count: 4 } },
    {
      method: "patch",
      encType: "application/json",
    },
  );
  await expect
    .poll(() => fetcher!.data)
    .toEqual({
      method: "PATCH",
      fields: [["_payload", '{"nested":{"count":4}}']],
    });
  expect(router.getSnapshot().url).toBe("http://localhost/");
  expect(router.getSnapshot().actionData).toBeUndefined();
});

for (const { name, api, element: h, root: mount } of frameworks) {
  it(`${name} renders and navigates without the data engine`, async (context) => {
    function Page() {
      const params = api.useParams();
      const [location] = api.useLocation();
      return h("output", null, `${params.id ?? "home"}: ${location}`);
    }
    const router = api.createRouter([
      api.defineRoute("/", { default: Page }),
      api.defineRoute("/tasks/:id", { default: Page }),
    ]);
    const container = document.createElement("div");
    const root = mount(container);
    document.body.append(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });
    root.render(
      h(
        api.RouterProvider,
        { router },
        h(api.Link, { href: "/tasks/42" }, "Open task"),
        h(api.Routes, { fallback: "Not found" }),
      ),
    );
    await expect
      .poll(() => container.querySelector("output")?.textContent)
      .toBe("home: /");
    container.querySelector("a")!.click();
    await expect
      .poll(() => container.querySelector("output")?.textContent)
      .toBe("42: /tasks/42");
    await router.navigate("/missing");
    await expect.poll(() => container.textContent).toContain("Not found");
  });
}

it("native form submissions keep successful controls rather than JSON-wrapping FormData", async () => {
  const router = react.createDataRouter([
    react.defineRoute("/", {
      action: async ({ request }) => [...(await request.formData())],
    }),
  ]);
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.name = "title";
  input.value = "Native form";
  form.append(input);
  const options = { action: "/", encType: "application/json" };
  submitForm(
    router,
    {
      currentTarget: form,
      defaultPrevented: false,
      preventDefault() {},
    },
    null,
    options,
  );
  await expect
    .poll(() => router.getSnapshot().actionData)
    .toEqual([["title", "Native form"]]);
  router.dispose();
});
