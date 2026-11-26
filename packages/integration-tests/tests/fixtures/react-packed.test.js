import assert from "node:assert/strict";
import {
  defineRoute,
  RouterProvider,
  Routes,
  useLoaderData,
} from "@kasperrt/smolter/react";
import {
  dispatchRoute,
  loadRouter,
  renderApplication,
} from "@kasperrt/smolter/react/server";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";

test("react-packed consumer", async () => {
  const route = defineRoute("/", {
    loader: () => "packed package works",
    default: Page,
  });
  function Page() {
    return createElement("p", null, useLoaderData());
  }
  const router = await loadRouter([route], "https://example.com/");
  const html = renderToString(
    createElement(RouterProvider, { router }, createElement(Routes, {})),
  );
  assert.match(html, /packed package works/);
  console.log("react: packed install + SSR passed");
  const response = await dispatchRoute(new Request("https://example.com/"), [
    route,
  ]);
  assert.equal(await response.json(), "packed package works");
  const { version } = await import("react");
  if (version.startsWith("18.")) {
    await assert.rejects(
      renderApplication(
        new Request("https://example.com/"),
        [route],
        { default: Routes, Layout: () => null },
        "/entry.js",
      ),
      /React DOM 19/,
    );
    return;
  }
  const { Document, Scripts } = await import(
    "@kasperrt/smolter/react/document"
  );
  const root = {
    default: Routes,
    Layout: ({ children }) =>
      createElement(
        Document,
        null,
        createElement("head"),
        createElement("body", null, children, createElement(Scripts)),
      ),
  };
  const documentHTML = await (
    await renderApplication(
      new Request("https://example.com/"),
      [route],
      root,
      "/entry.js",
    )
  ).text();
  assert.match(documentHTML, /packed package works/);
  assert.match(documentHTML, /smolter-data/);
});
