import assert from "node:assert/strict";
import {
  Await,
  defineRoute,
  Link,
  RouterProvider,
  Routes,
  useLoaderData,
} from "@kasperrt/smolter/preact";
import { configureApplication } from "@kasperrt/smolter/preact/client";
import { loadRouter } from "@kasperrt/smolter/preact/server";
import { h } from "preact";
import { Suspense } from "preact/compat";
import { render, renderToStringAsync } from "preact-render-to-string";

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

const link = () =>
  render(h(RouterProvider, { router }, h(Link, { href: "/join" }, "Join")));

assert.match(link(), /href="https:\/\/example\.com\/join"/);

configureApplication({
  resolveURL: (url) => new URL(url.pathname, "https://remote.example"),
});

assert.match(link(), /href="https:\/\/remote\.example\/join"/);

configureApplication({});
assert.match(link(), /href="https:\/\/example\.com\/join"/);

const deferred = await renderToStringAsync(
  h(
    Suspense,
    { fallback: h("p", null, "Pending") },
    h(Await, {
      resolve: Promise.resolve(42),
      children: (value) => h("output", null, value),
    }),
  ),
);
assert.match(deferred, /<output>42<\/output>/);

const rejected = await renderToStringAsync(
  h(
    Suspense,
    { fallback: h("p", null, "Pending") },
    h(Await, {
      resolve: Promise.reject(new Error("Unavailable")),
      errorElement: h("p", null, "Try again"),
      children: () => h("p", null, "Unexpected"),
    }),
  ),
);
assert.match(rejected, /Try again/);
assert.doesNotMatch(rejected, /Unexpected/);

console.log("preact: packed install + SSR + deferred rendering passed");
