import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  defineRoute,
  RouterProvider,
  Routes,
  useLoaderData,
} from "smolter/react";
import { loadRouter } from "smolter/server";

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
