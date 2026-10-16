import { h } from "preact";
import { render } from "preact-render-to-string";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import * as preact from "../packages/smolter/src/preact";
import * as react from "../packages/smolter/src/react";
import { loadRouter } from "../packages/smolter/src/server";

it("server renders React data without browser globals", async () => {
  const route = react.defineRoute("/", {
    loader: () => ({ title: "Hello React" }),
    default: Page,
  });
  function Page() {
    return createElement("h1", null, react.useLoaderData(route)?.title);
  }
  const router = await loadRouter([route], "https://test.dev/");
  expect(
    renderToString(
      createElement(
        react.RouterProvider,
        { router },
        createElement(react.Routes, {}),
      ),
    ),
  ).toContain("Hello React");
});
it("server renders Preact data through its own adapter", async () => {
  const route = preact.defineRoute("/", {
    loader: () => ({ title: "Hello Preact" }),
    default: Page,
  });
  function Page() {
    return h("h1", null, preact.useLoaderData(route)?.title);
  }
  const router = await loadRouter([route], "https://test.dev/");
  expect(
    render(
      h(
        preact.RouterProvider,
        { router },
        h(preact.Routes, { fallback: null }),
      ),
    ),
  ).toContain("Hello Preact");
});
