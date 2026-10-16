import assert from "node:assert/strict";
import { h } from "preact";
import { render } from "preact-render-to-string";
import {
  defineRoute,
  RouterProvider,
  Routes,
  useLoaderData,
} from "smolter/preact";
import { loadRouter } from "smolter/server";

const route = defineRoute("/", {
  loader: () => "packed package works",
  default: Page,
});

function Page() {
  return h("p", null, useLoaderData());
}

const router = await loadRouter([route], "https://example.com/");
const html = render(h(RouterProvider, { router }, h(Routes, {})));

assert.match(html, /packed package works/);

console.log("preact: packed install + SSR passed");
