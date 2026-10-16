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
    const router = api.createRouter([route]);
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
    const router = api.createRouter(
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
    const router = api.createRouter([route, other], { url: "/tasks/42" });
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
          { method: "post", id: "fetcher-form" },
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

    container.querySelector<HTMLButtonElement>("#fetcher-form button")!.click();

    await expect.poll(() => fetcher.data).toEqual({ count: 5, method: "POST" });
    await expect.poll(() => container.textContent).toContain('"data":5');

    await fetcher!.load();

    await expect.poll(() => fetcher.data).toBe(5);

    const body = new FormData();

    body.set("amount", "4");
    await fetcher!.submit(body, { method: "PUT" });
    await expect.poll(() => fetcher.data).toEqual({ count: 9, method: "PUT" });
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

it("integrates browser history and cancels in-flight work on disposal", async (context) => {
  const original = window.location.href;
  let finish: (value: string) => void = () => {};
  let signal: AbortSignal | undefined;
  const router = react.createRouter(
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
  const router = react.createRouter(
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
