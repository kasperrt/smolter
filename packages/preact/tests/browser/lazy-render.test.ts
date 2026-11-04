import { createDataRouter } from "@smolter/core";
import { prepareRoutes } from "@smolter/core/prepare-routes";
import { retainRoute } from "@smolter/core/presentation";
import { type ErrorProps, RouterProvider, Routes } from "@smolter/preact";
import { createElement } from "preact";
import { createRoot } from "preact/compat/client";
import { useState } from "preact/hooks";
import { expect, it } from "vitest";
import { lazyRoute } from "../../src/lazy-route.ts";

for (const source of ["loader", "module"]) {
  it(`renders ${source} failures in lazy routes`, async (context) => {
    const failure = new Error("Access denied");
    function Boundary({ error }: ErrorProps) {
      return createElement(
        "p",
        { role: "alert" },
        error?.message ?? "Missing error",
      );
    }
    const router = createDataRouter([
      lazyRoute({ path: "/", ErrorBoundary: true }, async () => {
        if (source === "module") return Promise.reject(failure);
        return { clientLoader: () => failure, ErrorBoundary: Boundary };
      }),
    ]);
    const container = document.createElement("div");
    const root = createRoot(container);
    context.onTestFinished(() => {
      root.unmount();
      router.dispose();
    });
    await router.navigate("/");
    root.render(
      createElement(
        RouterProvider,
        { router },
        createElement(Routes, { fallback: null }),
      ),
    );
    await expect.poll(() => container.textContent).toContain("Access denied");
  });
}

it("retains local view state when lazy routes share a component", async (context) => {
  function SharedView() {
    const [count, setCount] = useState(0);
    return createElement(
      "button",
      { onClick: () => setCount(count + 1) },
      count,
    );
  }
  const routes = ["/first", "/second"].map((path) =>
    lazyRoute({ path }, async () => ({
      default: SharedView,
      clientLoader: () => path,
    })),
  );
  const router = createDataRouter(routes);
  const container = document.createElement("div");
  const root = createRoot(container);
  context.onTestFinished(() => {
    root.unmount();
    router.dispose();
  });
  await router.navigate("/first");
  retainRoute(router, (commit) => commit());
  root.render(
    createElement(
      RouterProvider,
      { router },
      createElement(Routes, { fallback: null }),
    ),
  );
  await expect.poll(() => container.textContent).toBe("0");
  const button = container.querySelector("button")!;
  button.click();
  await expect.poll(() => container.textContent).toBe("1");
  await router.navigate("/second");
  await expect.poll(() => router.getSnapshot().path).toBe("/second");
  expect(container.querySelector("button")).toBe(button);
  expect(container.textContent).toBe("1");
  expect(router.getSnapshot().data).toBe("/second");
});

it("uses a lazily loaded page transition after route preparation", async () => {
  let calls = 0;
  const route = lazyRoute({ path: "/page" }, async () => ({
    clientLoader: () => "page",
    viewTransition(commit) {
      calls++;
      commit();
    },
  }));
  const router = createDataRouter(prepareRoutes([route]));
  retainRoute(router, (commit) => commit());
  await router.navigate("/page");
  expect(calls).toBeGreaterThan(0);
  expect(router.getSnapshot().data).toBe("page");
  router.dispose();
});
