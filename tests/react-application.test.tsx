/** @jsxImportSource react */

import { createDataRouter } from "@smolter/core";
import {
  Outlet,
  useLoaderData,
  useRootData,
  useRouteError,
} from "@smolter/react";
import { expect, it, onTestFinished, vi } from "vitest";
import {
  Document,
  Links,
  Meta,
  Scripts,
} from "../packages/react/src/document.tsx";
import { lazyRoute } from "../packages/react/src/lazy-route.ts";
import {
  dispatchRoute,
  renderApplication,
} from "../packages/server/src/react.ts";
import { applicationPlugins } from "../packages/vite/src/react.ts";

it("renders React root, metadata, route data, errors and hydration without a Preact renderer", async () => {
  function Page() {
    return (
      <p>
        {useRootData<string>()}:{useLoaderData<string>()}
      </p>
    );
  }
  function Boundary() {
    return <p>{useRouteError()?.message}</p>;
  }
  const root = {
    default: Outlet,
    ErrorBoundary: Boundary,
    loader: () => "session",
    meta: () => [
      { title: "SSR title" },
      { name: "description", content: "React" },
    ],
    links: () => [{ rel: "author", href: "/author" }],
    Layout: ({ children }: { children: import("react").ReactNode }) => (
      <Document>
        <head>
          <Meta />
          <Links />
        </head>
        <body>
          {children}
          <Scripts />
        </body>
      </Document>
    ),
  };
  const response = await renderApplication(
    new Request("https://example.test/"),
    [{ path: "/", loader: () => "loaded", default: Page }],
    root,
    "/entry.js",
  );
  const html = await response.text();
  expect(html).toContain("session");
  expect(html).toContain("loaded");
  expect(html).toContain("<title>SSR title</title>");
  expect(html).toContain("smolter-data");
  const failed = await renderApplication(
    new Request("https://example.test/"),
    [{ path: "/", default: Page }],
    {
      ...root,
      loader: () => {
        throw new Error("Root failed");
      },
    },
    "/entry.js",
    { earlyHydration: true },
  );
  expect(failed.status).toBe(500);
  expect(await failed.text()).toContain("Root failed");
  const data = await dispatchRoute(new Request("https://example.test/api"), [
    { path: "/api", loader: () => ({ value: 1 }) },
  ]);
  expect(data.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await data.json()).toEqual({ value: 1 });
});

it("selects React application tooling without Preact aliases", async () => {
  const plugins = applicationPlugins();
  const app = plugins.find((plugin) => plugin.name === "smolter-application")!;
  const config = app.config as () => { resolve: { dedupe: string[] } };
  expect(config().resolve.dedupe).toContain("react");
  expect(JSON.stringify(config())).not.toContain("preact");
  expect(plugins.some((plugin) => plugin.name === "smolter-lazy-routes")).toBe(
    true,
  );
});

it("shares lazy module metadata, action execution and cancellation semantics in React", async () => {
  let calls = 0;
  const route = lazyRoute(
    { path: "/", meta: true, clientAction: true, shouldRevalidate: true },
    async () => ({
      clientLoader: () => "ready",
      clientAction: () => ++calls,
      meta: () => [{ title: "Lazy" }],
      shouldRevalidate: () => false,
    }),
  );
  const router = createDataRouter([route]);
  await router.navigate("/");
  await router.submit("/", new FormData());
  expect(calls).toBe(1);
  expect(router.getSnapshot().actionData).toBe(1);
  expect(
    route.meta?.({
      data: undefined,
      loaderData: undefined,
      params: {},
      location: new URL("https://example.test"),
    }),
  ).toEqual([{ title: "Lazy" }]);
  const controller = new AbortController();
  controller.abort();
  expect(
    await route.clientLoader!({
      request: new Request("https://example.test"),
      params: {},
      signal: controller.signal,
      serverLoader: async () => undefined,
    }),
  ).toBeInstanceOf(Error);
  router.dispose();
});

it("requires React DOM 19 for integrated SSR without changing the legacy loadRouter entry", async () => {
  vi.resetModules();
  vi.doMock("react-dom/server", () => ({ renderToReadableStream: undefined }));
  onTestFinished(() => vi.doUnmock("react-dom/server"));
  {
    const { renderApplication: legacyRender } = await import(
      "../packages/server/src/react.ts"
    );
    await expect(
      legacyRender(
        new Request("https://example.test"),
        [],
        { default: Outlet, Layout: () => null },
        "/entry.js",
      ),
    ).rejects.toThrow("React DOM 19");
  }
});

it("disposes the request router when a renderer rejects before producing its shell", async () => {
  const { renderDocument } = await import(
    "../packages/server/src/render-application.ts"
  );
  let disposed = false;
  const failure = new Error("Shell failed");
  await expect(
    renderDocument(
      new Request("https://example.test"),
      [{ path: "/", default: () => null }],
      {},
      "/entry.js",
      { earlyHydration: true },
      (props) => {
        const dispose = props.router.dispose;
        props.router.dispose = () => {
          disposed = true;
          dispose();
        };
        return Promise.reject(failure);
      },
    ),
  ).rejects.toBe(failure);
  expect(disposed).toBe(true);
});

it("renders React document content without an optional root module", async () => {
  const { RouterApplication } = await import("@smolter/react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const routes = [{ path: "/", default: () => <main>Standalone route</main> }];
  const router = createDataRouter(routes);
  await router.navigate("/");
  const html = renderToStaticMarkup(
    <RouterApplication
      router={router}
      routes={routes}
      root={undefined}
      document
    />,
  );
  router.dispose();
  expect(html).toContain("<main>Standalone route</main>");
});
