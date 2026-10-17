import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  createResourceRouter,
  Resource,
  type ResourceLoaderArgs,
  ResourceProvider,
  type ResourceResult,
  type ResourceRouteModule,
  useResourceActionData,
  useResourceData,
  useResourceFetcher,
  useResourceNavigation,
  useResourceRevalidator,
  useResourceSubmit,
} from "../../packages/react/src/data.ts";
import { deferred } from "../helpers/deferred.ts";

it("keeps resource fetcher forms separate from page action data", async (context) => {
  let count = 0;
  let fetcher: ReturnType<typeof useResourceFetcher<number>>;
  let revalidator: ReturnType<typeof useResourceRevalidator>;

  function SubmitButton() {
    const submit = useResourceSubmit();

    return h("button", { onClick: () => void submit() }, "Add");
  }

  function Screen() {
    const data = useResourceData<number>();
    const action = useResourceActionData<number>();
    const navigation = useResourceNavigation();

    fetcher = useResourceFetcher<number>();
    revalidator = useResourceRevalidator();

    return h(
      "section",
      null,
      h(
        "output",
        null,
        JSON.stringify({ data, action, navigation, fetcher: fetcher[0] }),
      ),
      h(fetcher[1].Form, { input: 2 }, h(SubmitButton)),
    );
  }

  const route: ResourceRouteModule = {
    default: Screen,
    loader: async () => ({ data: count, error: "" }),
    action: async ({ input }) => {
      count += Number(input);

      return { data: count, error: "" };
    },
  };
  const router = createResourceRouter(new Map([["counter", route]]));
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });

  root.render(
    h(ResourceProvider, { router }, h(Resource, { routeId: "counter" })),
  );
  await expect.poll(() => container.textContent).toContain('"data":0');

  container.querySelector("button")!.click();

  await expect.poll(() => fetcher[0].data).toBe(2);
  expect(router.getSnapshot("counter", {}).actionData).toBeNull();
  expect(fetcher![0].state).toBe("idle");
  await expect.poll(() => router.getSnapshot("counter", {}).loaderData).toBe(2);

  count = 5;
  await fetcher![1].load();
  await expect.poll(() => fetcher[0].data).toBe(5);
  expect(router.getSnapshot("counter", {}).loaderData).toBe(2);

  await revalidator!.revalidate();
  await expect.poll(() => router.getSnapshot("counter", {}).loaderData).toBe(5);
});

for (const method of ["load", "submit"] as const) {
  it(`cancels stale resource fetcher ${method} requests and unmounted requests`, async (context) => {
    const slow = deferred<ResourceResult<number>>();
    const started = deferred<void>();
    const unmounted = deferred<ResourceResult<number>>();
    const unmountStarted = deferred<void>();
    const signals: AbortSignal[] = [];
    let fetcher: ReturnType<typeof useResourceFetcher<number>>;

    const slowHandler = ({ signal }: ResourceLoaderArgs) => {
      signals.push(signal);
      started.resolve();

      return slow.promise;
    };
    const unmountHandler = ({ signal }: ResourceLoaderArgs) => {
      signals.push(signal);
      unmountStarted.resolve();

      return unmounted.promise;
    };
    const fastHandler = async () => ({ data: 2, error: "" });
    const router = createResourceRouter(
      new Map([
        ["slow", { loader: slowHandler, action: slowHandler }],
        ["fast", { loader: fastHandler, action: fastHandler }],
        ["unmounted", { loader: unmountHandler, action: unmountHandler }],
      ]),
    );
    const container = document.createElement("div");
    const root = createRoot(container);

    document.body.append(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
      container.remove();
    });

    function Screen() {
      fetcher = useResourceFetcher<number>({ routeId: "slow" });

      return h("output", null, JSON.stringify(fetcher[0]));
    }

    root.render(h(ResourceProvider, { router }, h(Screen)));
    await expect.poll(() => container.textContent).toContain('"state":"idle"');

    const first =
      method === "load" ? fetcher![1].load() : fetcher![1].submit(1);

    await started.promise;
    await (method === "load"
      ? fetcher![1].load({ routeId: "fast" })
      : fetcher![1].submit(2, { routeId: "fast" }));

    expect(signals[0].aborted).toBe(true);
    slow.resolve({ data: 1, error: "" });
    await first;
    await expect.poll(() => fetcher[0].data).toBe(2);
    expect(fetcher![0].state).toBe("idle");

    const last =
      method === "load"
        ? fetcher![1].load({ routeId: "unmounted" })
        : fetcher![1].submit(3, { routeId: "unmounted" });

    await unmountStarted.promise;
    root.render(null);
    await expect.poll(() => signals[1].aborted).toBe(true);
    unmounted.resolve({ data: 3, error: "" });
    await last;
  });
}

interface RetryProps {
  retry: () => void;
}

it("renders a resource loading fallback and recovers through its error boundary", async (context) => {
  const pending = deferred<void>();
  let loads = 0;

  function Screen() {
    const data = useResourceData<number>();

    return h("output", null, String(data));
  }

  function Retry({ retry }: RetryProps) {
    return h("button", { onClick: retry }, "Retry");
  }

  const route: ResourceRouteModule = {
    default: Screen,
    HydrateFallback: () => h("p", null, "Loading resource"),
    ErrorBoundary: Retry,
    loader: () => {
      loads++;

      if (loads === 1) {
        return pending.promise.then(() =>
          Promise.reject(Error("private detail")),
        );
      }

      return Promise.resolve({ data: 3, error: "" });
    },
  };
  const router = createResourceRouter(new Map([["retry", route]]));
  const container = document.createElement("div");
  const root = createRoot(container);

  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
  });

  root.render(
    h(ResourceProvider, { router }, h(Resource, { routeId: "retry" })),
  );
  await expect.poll(() => container.textContent).toBe("Loading resource");

  pending.resolve();
  await expect.poll(() => container.textContent).toBe("Retry");
  expect(router.getSnapshot("retry", {}).loaderError).not.toContain(
    "private detail",
  );

  container.querySelector("button")!.click();

  await expect.poll(() => container.textContent).toBe("3");
  expect(loads).toBe(2);
  expect(router.getSnapshot("retry", {}).unexpectedError).toBe(false);
});

it("recovers a resource render failure through retry and route changes", async (context) => {
  let broken = true;
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  function Screen() {
    const data = useResourceData<number>();

    if (broken) JSON.parse("{");

    return h("output", null, String(data));
  }

  function Retry({ retry }: RetryProps) {
    return h(
      "button",
      {
        onClick: () => {
          broken = false;
          retry();
        },
      },
      "Retry render",
    );
  }

  const route: ResourceRouteModule = {
    default: Screen,
    ErrorBoundary: Retry,
    loader: async () => ({ data: 42, error: "" }),
  };
  const router = createResourceRouter(
    new Map([
      ["first", route],
      ["second", route],
    ]),
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (routeId: string) =>
    root.render(h(ResourceProvider, { router }, h(Resource, { routeId })));

  document.body.append(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
    container.remove();
    logged.mockRestore();
  });

  render("first");
  await expect.poll(() => container.textContent).toBe("Retry render");
  expect(logged).toHaveBeenCalled();

  container.querySelector("button")!.click();
  await expect.poll(() => container.textContent).toBe("42");

  broken = true;
  render("second");
  await expect.poll(() => container.textContent).toBe("Retry render");

  broken = false;
  render("first");
  await expect.poll(() => container.textContent).toBe("42");
});
