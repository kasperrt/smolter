import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { loadRouter } from "@smolter/server";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";

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

it("renders a fallback for client-only data on the server", async () => {
  const route = react.defineRoute("/", {
    clientLoader: () => "browser",
    default: () => createElement("p", null, "Client page"),
    HydrateFallback: () => createElement("p", null, "Waiting for browser"),
  });
  const router = await loadRouter([route], "https://test.dev/");
  const html = renderToString(
    createElement(
      react.RouterProvider,
      { router },
      createElement(react.Routes, {}),
    ),
  );

  expect(html).toContain("Waiting for browser");

  expect(html).not.toContain("Client page");
});
