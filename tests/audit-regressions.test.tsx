/** @jsxImportSource preact */
import { createDataRouter } from "@smolter/core";
import { Outlet, useLoaderData, useRouteError } from "@smolter/preact";
import { Suspense } from "preact/compat";
import { expect, it } from "vitest";
import { Await } from "../packages/preact/src/await.tsx";
import { Document, Scripts } from "../packages/preact/src/document.tsx";
import type { RootModule } from "../packages/preact/src/route-types.ts";
import {
  dispatchRoute,
  renderApplication,
} from "../packages/server/src/application.tsx";
import { handleRequest } from "../packages/server/src/index.ts";
import { deferred } from "./helpers/deferred.ts";

const root: RootModule = {
  default: Outlet,
  Layout: ({ children }) => (
    <Document>
      <head />
      <body>
        {children}
        <Scripts />
      </body>
    </Document>
  ),
};

it("revalidates root data after redirecting mutations without replaying actions or loading the destination twice", async () => {
  for (const fetcher of [false, true]) {
    let actions = 0;
    let loads = 0;
    let roots = 0;
    const router = createDataRouter(
      [
        {
          path: "/login",
          action: () => {
            actions++;
            return new Response(null, {
              status: 303,
              headers: { Location: "/admin" },
            });
          },
        },
        { path: "/admin", loader: () => ++loads },
      ],
      { url: "http://local/login" },
    );
    router.registerRevalidator("root", async (args) => {
      expect(args.formAction).toBe("http://local/login");
      expect(args.reason).toBe("action");
      roots++;
    });
    const target = fetcher ? router.createFetcher() : router;
    await target.submit("/login", new FormData());
    expect({ actions, loads, roots }).toEqual({
      actions: 1,
      loads: 1,
      roots: 1,
    });
    expect(router.getSnapshot().url).toBe("http://local/admin");
    expect(target.getSnapshot().state).toBe("idle");
    router.dispose();
  }
});

it("provides explicit loader reasons instead of browser-location timing", async () => {
  const reasons: unknown[] = [];
  const router = createDataRouter([
    {
      path: "/",
      loader: ({ reason }) => {
        reasons.push(reason);
        return 1;
      },
    },
  ]);
  const stop = router.start();
  await expect.poll(() => router.getSnapshot().loaded).toBe(true);
  stop();
  await router.navigate("/");
  await router.revalidate();
  await router.createFetcher().load("/");
  expect(reasons).toEqual(["initial", "navigation", "revalidation", "fetcher"]);
  router.dispose();
});

it("starts root and route loaders concurrently and streams a shell before deferred data settles", async () => {
  const critical = deferred<string>();
  const slow = deferred<string>();
  let routeStarted = false;
  function Page() {
    const data = useLoaderData<{ detail: Promise<string> }>();
    return (
      <main>
        Shell
        <Suspense fallback={<p>Pending detail</p>}>
          <Await resolve={data!.detail}>{(detail) => <p>{detail}</p>}</Await>
        </Suspense>
      </main>
    );
  }
  const responsePromise = renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: Page,
        loader: () => {
          routeStarted = true;
          return { detail: slow.promise };
        },
      },
    ],
    { ...root, loader: () => critical.promise },
    "/client.js",
  );
  await expect.poll(() => routeStarted).toBe(true);
  critical.resolve("Root");
  const response = await responsePromise;
  const reader = response.body!.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain("Pending detail");
  slow.resolve("Ready detail");
  let remaining = "";
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    remaining += new TextDecoder().decode(part.value);
  }
  expect(remaining).toContain("Ready detail");
  expect(remaining).toContain('document.getElementById("smolter-data")');
});

it("renders root loader failures through the root boundary and preserves status and hydration ownership", async () => {
  function Boundary() {
    return <p>Root failure: {String(useRouteError())}</p>;
  }
  const response = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => <p>Page</p>,
        ErrorBoundary: () => <p>Wrong boundary</p>,
      },
    ],
    {
      ...root,
      loader: () => {
        throw Object.assign(new Error("Session unavailable"), { status: 503 });
      },
      ErrorBoundary: Boundary,
    },
    "/client.js",
  );
  const html = await response.text();
  expect(response.status).toBe(503);
  expect(html).toContain("Root failure:");
  expect(html).not.toContain("Wrong boundary");
  expect(html).toContain('"rootError":true');
});

it("preserves root redirects and enforces private cache policy for all data responses", async () => {
  const response = await renderApplication(
    new Request("http://local/"),
    [{ path: "/", default: () => null }],
    {
      ...root,
      loader: () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/login", "Set-Cookie": "session=x" },
        }),
    },
    "/client.js",
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("Set-Cookie")).toBe("session=x");
  for (const dispatch of [
    dispatchRoute,
    (request: Request) => handleRequest([], request),
  ]) {
    const result = await dispatch(new Request("http://local/missing"), []);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  }
});

it("normalizes rejected route loaders through their error boundaries", async () => {
  const response = await renderApplication(
    new Request("http://local/"),
    [
      {
        path: "/",
        default: () => null,
        loader: () => Promise.reject(new Error("Rejected route")),
        ErrorBoundary: () => <p>Route unavailable</p>,
      },
    ],
    root,
    "/client.js",
  );
  expect(response.status).toBe(500);
  expect(await response.text()).toContain("Route unavailable");
});
