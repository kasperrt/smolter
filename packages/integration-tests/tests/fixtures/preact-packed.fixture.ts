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
import { expect, test } from "vitest";

test("preact-packed consumer", async () => {
  const route = defineRoute("/", {
    loader: () => "packed package works",
    default: Page,
  });
  function Page() {
    return h("p", null, useLoaderData());
  }
  const router = await loadRouter([route], "https://example.com/");
  const html = render(
    h(RouterProvider, { router }, h(Routes, { fallback: null })),
  );
  expect(html).toMatch(/packed package works/);
  const link = () =>
    render(h(RouterProvider, { router }, h(Link, { href: "/join" }, "Join")));
  expect(link()).toMatch(/href="https:\/\/example\.com\/join"/);
  configureApplication({
    resolveURL: (url) => new URL(url.pathname, "https://remote.example"),
  });
  expect(link()).toMatch(/href="https:\/\/remote\.example\/join"/);
  configureApplication({});
  expect(link()).toMatch(/href="https:\/\/example\.com\/join"/);
  const deferred = await renderToStringAsync(
    h(
      Suspense,
      { fallback: h("p", null, "Pending") },
      h(Await, {
        resolve: Promise.resolve(42),
        children: (value) => h("output", null, String(value)),
      }),
    ),
  );
  expect(deferred).toMatch(/<output>42<\/output>/);
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
  expect(rejected).toMatch(/Try again/);
  expect(rejected).not.toMatch(/Unexpected/);
});
