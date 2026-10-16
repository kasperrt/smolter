import * as preact from "@smolter/preact";
import * as react from "@smolter/react";
import { loadRouter } from "@smolter/server";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { deferred } from "./helpers/deferred";

it("forwards incoming request cancellation to SSR loaders", async () => {
  const controller = new AbortController();
  const started = deferred<react.DataArgs>();
  const completed = deferred<void>();
  const route = react.defineRoute("/", {
    loader: (args) => {
      started.resolve(args);

      return completed.promise;
    },
  });
  const pending = loadRouter(
    [route],
    new Request("https://test.dev/", { signal: controller.signal }),
  );
  const args = await started.promise;

  expect(args.signal.aborted).toBe(false);
  expect(args.request.signal.aborted).toBe(false);

  controller.abort();

  expect(args.signal.aborted).toBe(true);
  expect(args.request.signal.aborted).toBe(true);
  expect(args.signal.reason).toBe(controller.signal.reason);

  completed.resolve();

  const router = await pending;

  router.dispose();
});

it("preserves an already aborted SSR request signal", async () => {
  const signal = AbortSignal.abort();
  const route = react.defineRoute("/", {
    loader: (args) => ({
      aborted: args.signal.aborted,
      requestAborted: args.request.signal.aborted,
    }),
  });
  const router = await loadRouter(
    [route],
    new Request("https://test.dev/", { signal }),
  );

  expect(router.getSnapshot().data).toEqual({
    aborted: true,
    requestAborted: true,
  });

  router.dispose();
});

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
