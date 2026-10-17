import { createDataRouter } from "@smolter/core";
import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { createElement as preactElement } from "preact/compat";
import { createRoot as preactRoot } from "preact/compat/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

for (const { name, api, h, mount } of [
  { name: "React", api: react, h: createElement, mount: createRoot },
  {
    name: "Preact",
    api: preact as unknown as typeof react,
    h: preactElement as typeof createElement,
    mount: preactRoot as typeof createRoot,
  },
]) {
  it(`${name} exposes matches and inherited outlet context across navigation`, async (context) => {
    function Page() {
      const [match] = api.useMatches();
      const label = api.useOutletContext<string>();
      return h(
        "output",
        null,
        `${label}:${match.id}:${match.params.id}:${match.data}`,
      );
    }
    const router = createDataRouter([
      {
        path: "/:id",
        id: "item",
        loader: ({ params }) => params.id,
        default: Page,
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
    root.render(
      h(
        api.RouterProvider,
        { router },
        h(api.Outlet, { context: "layout" }, h(api.Outlet)),
      ),
    );
    await expect.poll(() => container.textContent).toBe("layout:item:one:one");
    await router.navigate("/two");
    await expect.poll(() => container.textContent).toBe("layout:item:two:two");
    root.render(
      h(
        api.RouterProvider,
        { router },
        h(api.Outlet, { context: "updated" }, h(api.Outlet)),
      ),
    );
    await expect.poll(() => container.textContent).toBe("updated:item:two:two");
  });
}
