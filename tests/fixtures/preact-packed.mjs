import assert from "node:assert/strict";
import {
  defineRoute,
  RouterProvider,
  Routes,
  useLoaderData,
} from "@kasperrt/smolter/preact";
import { loadRouter } from "@kasperrt/smolter/server";
import { h } from "preact";
import { render } from "preact-render-to-string";

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
