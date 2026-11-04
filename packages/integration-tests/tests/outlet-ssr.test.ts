import { createDataRouter } from "@smolter/core";
import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { createElement as preactElement } from "preact/compat";
import preactRender from "preact-render-to-string";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

it("renders React matches and outlet context on the server", async () => {
  function Page() {
    return createElement(
      "p",
      null,
      `${react.useOutletContext<string>()}:${react.useMatches()[0].data}`,
    );
  }
  const router = createDataRouter([
    { path: "/", loader: () => "loaded", default: Page },
  ]);
  await router.navigate("/");
  expect(
    renderToString(
      createElement(
        react.RouterProvider,
        { router },
        createElement(react.Outlet, { context: "shell" }),
      ),
    ),
  ).toBe("<p>shell:loaded</p>");
  router.dispose();
});

it("renders Preact matches under a plain provider on the server", async () => {
  function Page() {
    return preactElement(
      "p",
      null,
      `${preact.useOutletContext<string>()}:${preact.useMatches()[0].data}`,
    );
  }
  const router = createDataRouter([
    { path: "/", loader: () => "loaded", default: Page },
  ]);
  await router.navigate("/");
  expect(
    preactRender(
      preactElement(
        preact.RouterProvider,
        { router },
        preactElement(preact.Outlet, { context: "shell" }),
      ),
    ),
  ).toBe("<p>shell:loaded</p>");
  router.dispose();
});
