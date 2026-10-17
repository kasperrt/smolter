import { configureApplication } from "@smolter/core/environment";
import * as react from "@smolter/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";

it("React links keep resolved hrefs, prefetches, and clicks on the same route", async (context) => {
  let preloads = 0;
  const intents: string[] = [];
  const router = react.createDataRouter(
    [
      react.defineRoute("/items/one", {}),
      react.defineRoute("/mapped", {
        loader: () => "Mapped",
        preload: async () => {
          preloads++;
        },
      }),
      react.defineRoute("/other/one", {}),
      react.defineRoute("/other/two", { loader: () => "Relative" }),
    ],
    { url: "/items/one" },
  );
  const container = document.createElement("div");
  const root = createRoot(container);

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
    return createElement("output", null, react.useURLLocation().href);
  }

  root.render(
    createElement(
      react.RouterProvider,
      { router },
      createElement(LocationReader, null),
      createElement(
        react.Link,
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
  anchor.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
  anchor.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));
  await expect
    .poll(() => ({ preloads, intents }))
    .toEqual({ preloads: 3, intents: ["focus", "pointerenter", "touchstart"] });
  expect(intents).toEqual(["focus", "pointerenter", "touchstart"]);
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
