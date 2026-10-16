# smolter _

<!-- bundlejs:start -->
[![react gzip size](https://deno.bundlejs.com/?q=%40kasperrt%2Fsmolter%400.0.1%2Freact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react%2F*%22%5D%7D%7D&badge)](https://bundlejs.com/?q=%40kasperrt%2Fsmolter%400.0.1%2Freact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react%2F*%22%5D%7D%7D&bundle)
[![preact gzip size](https://deno.bundlejs.com/?q=%40kasperrt%2Fsmolter%400.0.1%2Fpreact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22preact%22%2C%22preact%2F*%22%5D%7D%7D&badge)](https://bundlejs.com/?q=%40kasperrt%2Fsmolter%400.0.1%2Fpreact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22preact%22%2C%22preact%2F*%22%5D%7D%7D&bundle)
<!-- bundlejs:end -->

A typed data router for React and Preact. **Zero runtime dependencies.**

Loaders read. Actions mutate. Components render. Fetchers read or submit to a
route without navigating. Successful mutations can revalidate the current
loader; `shouldRevalidate` decides when that work is needed.

Inspired by [wouter](https://github.com/molefrog/wouter)
and [React Router](https://reactrouter.com/).

## Contents

- [Install](#install)
- [Try the four standalone examples](#try-the-four-standalone-examples)
- [Choose file routing or manual routes](#choose-file-routing-or-manual-routes)
- [Server and client handlers](#server-and-client-handlers)
- [Fetchers read and mutate](#fetchers-read-and-mutate)
- [Decide when to revalidate](#decide-when-to-revalidate)
- [Types follow the handler](#types-follow-the-handler)
- [Server rendering](#server-rendering)
- [Package entries](#package-entries)
- [Size and checks](#size-and-checks)

## Install

Install the scoped npm package and choose your framework explicitly:

```sh
pnpm add @kasperrt/smolter
```

```ts
import { createRouter, useFetcher } from "@kasperrt/smolter/react";
// Preact: import from "@kasperrt/smolter/preact".
```

## Try the four standalone examples

```sh
pnpm install
pnpm dev
```

| App | Open | Data |
| --- | --- | --- |
| [React SPA](./apps/react) | http://127.0.0.1:5173 | Client loaders/actions, localStorage |
| [Preact SPA](./apps/preact) | http://127.0.0.1:5174 | Client loaders/actions, localStorage |
| [React SSR](./apps/react-ssr) | http://127.0.0.1:5175 | Server loaders/actions, hydration |
| [Preact SSR](./apps/preact-ssr) | http://127.0.0.1:5176 | Server loaders/actions, hydration |

Each app has its own entrypoints, routes, and data code. Only UI components are
shared. Preact examples do not import React. Each includes:

- `/`: counter, fetcher POST, automatic and manual revalidation.
- `/tasks`: list, create form, and a fetcher-only task preview.
- `/tasks/:id`: PATCH, DELETE, validation, and skipping no-op revalidation.
- `/about`: the separation between data and rendering.

The right panel shows an equivalent public-API example with styling omitted,
plus the actual loader/action files. Its content follows the current route and
framework. Gzip labels are generated from the source measurement during dev and
build; SSR labels include the optional browser transport.

Use `SMOLTER_ROUTES=manual pnpm dev` to run the same apps with manual route tables.
Build with `pnpm build:examples`. Each SSR app also has a `start` command for its
production HTTP server; see its README.

## Choose file routing or manual routes

### Flat files

The optional Vite 8+ plugin discovers route files at build time. No file scanner
or filename parser enters the browser bundle.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { fileRouter } from "@kasperrt/smolter/vite";

export default defineConfig({
  plugins: [fileRouter({ directory: "src/routes" })],
});
```

```ts
// app.ts
import { createRouter } from "@kasperrt/smolter/react";
import routes from "virtual:smolter/routes";

export const router = createRouter(routes, { browser: true });
```

| File or folder | URL |
| --- | --- |
| `routes/_index/route.tsx` | `/` |
| `routes/tasks._index/route.tsx` | `/tasks` |
| `routes/tasks.$id/route.tsx` | `/tasks/:id` |
| `routes/_account.settings/route.tsx` | `/settings` |
| `routes/files.$/route.tsx` | `/files/*` |
| `routes/about.tsx` | `/about` |

Dots separate URL segments; `$name` is a parameter; terminal `$` is a splat.
`_index` is an index route. Leading underscores are pathless naming groups;
a trailing underscore is removed from that segment. Colocated helpers inside
route folders are ignored. `.ts`, `.tsx`, `.js`, and `.jsx` are supported.

**Only flat matching:** there are no nested outlets, inherited loaders, or layout
chains. A pathless group module itself is not rendered or executed. Group names
do not provide authentication. Static paths are ordered before parameters, then
splats. Conflicting patterns and unsupported optional/escaped syntax are rejected.

For the virtual module, add this declaration to your app:

```ts
// env.d.ts
// Include vite/client in your tsconfig types as usual.
declare module "virtual:smolter/routes" {
  const routes: import("@kasperrt/smolter/core").Route[];
  export default routes;
}
```

Outside Vite, `flatRoutes(directory)` from `@kasperrt/smolter/files` returns
`{ path, file }[] | Error` for your build tool to turn into imports.

### Manual routes

```tsx
import { createRouter, defineRoute } from "@kasperrt/smolter/react";
import * as tasks from "./tasks/route";
import * as task from "./task/route";

export const tasksRoute = defineRoute("/tasks", tasks);
export const taskRoute = defineRoute("/tasks/:id", task);
export const routes = [tasksRoute, taskRoute];
export const router = createRouter(routes, { browser: true });
```

Or pass handlers directly to `defineRoute(path, { loader, action, default: View })`.
First registered match wins. Trailing slashes are ignored. `/tasks/42` supplies
`params.id === "42"`; query parameters come from `new URL(request.url)`.

Use the same API from **`@kasperrt/smolter/preact`** for Preact. Render the selected route
inside the provider:

```tsx
<RouterProvider router={router}>
  <Link href="/tasks">Tasks</Link>
  <Routes />
</RouterProvider>
```

## Server and client handlers

A route can export all four handlers together:

```ts
// routes/tasks.$id/route.ts
export { default } from "./view";

export { loader } from "./loader";
export { action } from "./action";

export { clientLoader } from "./client-loader";
export { clientAction } from "./client-action";

export { shouldRevalidate } from "./should-revalidate";
export { HydrateFallback, ErrorBoundary } from "../../boundaries";
```

With the optional server integration:

- `loader` and `action` execute on the server.
- Browser navigation and submissions reach them automatically over HTTP.
- Optional `clientLoader` and `clientAction` take over browser execution. They
  may do browser-only work or call `serverLoader()` / `serverAction()`.
- SSR executes the server loader and hydration reuses that data.

```ts
// client-loader.ts
import type { ClientLoaderArgs } from "@kasperrt/smolter/client";
import type { loader } from "./loader";

export async function clientLoader({ serverLoader }: ClientLoaderArgs<typeof loader>) {
  return await serverLoader();
}
```

```ts
// client-action.ts
import type { ClientActionArgs } from "@kasperrt/smolter/client";
import type { action } from "./action";

export async function clientAction({ serverAction }: ClientActionArgs<typeof action>) {
  return await serverAction();
}
```

Handlers receive `{ request, params, signal }`. Server callbacks add the typed
call-through functions. A client-only handler can instead use browser storage
or call an unrelated API itself; components do not need to fetch.

A new navigation aborts the previous navigation's signal. Pass `signal` (or
`request.signal`) to your own `fetch` calls so the underlying request is cancelled:

```ts
// loader.ts
import type { DataArgs } from "@kasperrt/smolter/react";

export async function clientLoader({ signal }: DataArgs) {
  const response = await fetch("/api/tasks", { signal });

  return await response.json();
}
```

Server transport forwards this signal automatically, including calls through
`serverLoader()`. For SSR, `loadRouter(routes, request)` combines the incoming
request's signal with the router's signal. The host must abort that incoming
request when a client disconnects. Cancelled navigation requests cannot overwrite
the current page's data or error state. Aborting a request does not undo a mutation already processed
by the server.

Keep server handlers in separate files and re-export them as shown. The plugin
removes these re-exports from browser modules and inserts transport functions.
It rejects inline server handlers and `export *` rather than risking server code
in a client bundle. Type-only imports from server handlers are safe. Do not
import server code directly into client views or client handlers.

The Vite dev plugin mounts `/_smolter?url=...`. Production hosts dispatch that
endpoint through `handleRequest(routes, request)` from `@kasperrt/smolter/server`, using
the requested route URL. Both SSR examples include a working host. The host
owns authentication, session cookies, HTTP policy, and deployment.

Manual server routes use `serverRoute<typeof import("./route")>(path, clientModule)`
from `@kasperrt/smolter/client` in the browser and `defineRoute` on the server. This keeps
the type connection without importing server code at runtime. To use manual
tables with the dev transport:

```ts
import { routerPlugin } from "@kasperrt/smolter/vite";

routerPlugin({
  clientRoutes: "src/manual-browser-routes.ts",
  serverRoutes: "src/manual-routes.ts",
});
```

Each table exports `routes`. The standalone examples contain both tables.

Without the optional integration, `createRouter` invokes handlers locally:
client handlers take precedence, with ordinary handlers as fallbacks.
`loadRouter` selects server handlers only. Core-only usage does not create HTTP
endpoints or compiler boundaries by itself.

## Fetchers read and mutate

A fetcher read returns data **to that fetcher**, not the page loader:

```tsx
const preview = useFetcher<typeof taskLoader>();

<button onClick={() => preview.load("/tasks/42")}>Preview</button>
<p>{preview.data?.title}</p>
```

`load` calls the matched route's loader without navigating or revalidating the
current page. In an SSR app it crosses the server transport; in a client-only
app it invokes the client loader locally.

A mutation targets a registered route too:

```tsx
const save = useFetcher<typeof taskAction>();

<save.Form action="/tasks/42" method="patch">
  <input name="title" defaultValue="Write the docs" />

  <button disabled={save.state !== "idle"}>Save</button>

  {save.error && <p role="alert">{save.error.message}</p>}
</save.Form>
```

This matches `/tasks/:id` and calls its action with a PATCH `Request` and
`params.id === "42"`. The result goes into `save.data`; the current page loader
then revalidates unless it opts out. The page URL stays unchanged.

```ts
const body = new FormData();

body.set("title", "Updated title");

await save.submit(body, { action: "/tasks/42", method: "PATCH" });
```

POST, PUT, PATCH, and DELETE are supported. GET forms call loaders. Named submit
buttons and `formaction` / `formmethod` overrides are supported.

`useFetcher(taskRoute)` infers its result types and binds a default target.
For a different parameterized resource, supply a concrete URL; `/tasks/:id` is
a pattern, not a destination. Without an explicit target, a fetcher uses its
bound route or the current URL. Each hook owns independent `data`, `error`, and
`state` (`idle`, `loading`, `submitting`).

Regular `<Form>` navigates and exposes action results through `useActionData()`.
Fetcher results belong to `fetcher.data`, not `useActionData()`.

## Decide when to revalidate

```ts
// should-revalidate.ts
import type { RevalidationArgs } from "@kasperrt/smolter/react";

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: RevalidationArgs) {
  if (actionResult && typeof actionResult === "object" && "changed" in actionResult) {
    return actionResult.changed !== false;
  }

  return defaultShouldRevalidate;
}
```

The callback receives `reason` (`"action"`, `"manual"`, or `"navigation"`),
`currentUrl`, `nextUrl`, `formMethod`, `formAction`, `formData`, `actionResult`,
and `defaultShouldRevalidate`. `url` is an alias for `nextUrl`.

For an already-loaded route, returning `false` also retains its data when navigating
to a different query string or parameter, including back/forward navigation. The URL
and params still update. Compare `currentUrl` with `nextUrl` before skipping a reload
when the destination needs different data. First visits, retries after loader errors,
and explicit `fetcher.load()` calls always load their destination.

This controls loader refreshes; it does not rerun actions or reload the document.
Existing page data stays visible during manual and post-action refreshes.

`const revalidate = useRevalidator(); await revalidate()` requests a manual refresh.
The task-detail examples return `{ changed: false }` for an unchanged title;
the corresponding loader is skipped.

## Types follow the handler

```tsx
const data = useLoaderData(taskRoute);
const result = useActionData(taskRoute);
const fetcher = useFetcher(taskRoute);
```

Or use `useLoaderData<typeof loader>()` / `useActionData<typeof action>()` inside
a route module to avoid circular imports. The return type is inferred; you do
not repeat a data interface. TypeScript needs the route argument or function
type—it cannot infer an unrelated nearby export from a filename.

Route-based inference includes ordinary and client handler results. Data is
optional before a read or submission. Returned errors are excluded from data
types and appear in error state. `ErrorBoundary` handles route data failures;
fetcher errors stay local. `HydrateFallback` renders during an initial pending read; a completed loader returning `undefined` does not
remount the fallback during revalidation. Return a `Response` with a `Location` header to redirect.

## Server rendering

```tsx
import { loadRouter, serialize } from "@kasperrt/smolter/server";

const router = await loadRouter(routes, incomingRequest);
const html = renderToString(
  <RouterProvider router={router}><Routes /></RouterProvider>,
);
const hydrationJSON = serialize(router.getSnapshot());
```

Create a fresh router per request. Embed the serialized snapshot in a JSON
script, restore it with `deserialize` from `@kasperrt/smolter/client`, and pass it as
`hydrationData` to `createRouter`. This preserves loader errors through hydration
without exposing server stacks or causes. Error boundaries should display the
error message, not its stack.

```ts
import { deserialize } from "@kasperrt/smolter/client";
import { createRouter } from "@kasperrt/smolter/react";
import routes from "virtual:smolter/routes";

const data = document.getElementById("smolter-data");
const router = createRouter(routes, {
  browser: true,
  hydrationData: data?.textContent ? deserialize(data.textContent) : undefined,
});
```
Then hydrate with your framework. A client-only route renders its fallback on
the server and loads after hydration. Data must be JSON serializable; script
closing characters are escaped and errors omitted.

`handleRequest` dispatches data requests directly to registered server loaders
and actions. It does not manufacture a second counter API or run client handlers.
The SSR examples use the same server route definitions for HTML and data requests.

## Package entries

Use `@kasperrt/smolter/react` for React 18+ and `@kasperrt/smolter/preact` for Preact 10.25+.
The root `@kasperrt/smolter` entry (also available as `@kasperrt/smolter/core`) is framework-independent.
Server helpers live in `@kasperrt/smolter/server`; optional browser transport in `@kasperrt/smolter/client`;
flat file routing in `@kasperrt/smolter/vite` and `@kasperrt/smolter/files`.

On JSR, install `@kasperrt/smolter` using the
[JSR package instructions](https://jsr.io/docs/npm-compatibility) and import
`@kasperrt/smolter/react` or `@kasperrt/smolter/preact`. Its `core`, `client`,
`server`, and `files` subpaths match npm. The Vite plugin is npm-only:
use `@kasperrt/smolter/vite` from the npm package when adding file routing.

## Size and checks

`pnpm size` measures every browser export with esbuild, Terser, and gzip level 9.
Frameworks are excluded; library dependencies are included. It compares the same
build settings against pinned wouter entries. Both adapters must be strictly
smaller than their corresponding wouter entry; exceeding either fails the check. Optional server transport is measured separately and included in SSR
example labels. File discovery is build-only.

<!-- size-comparison:start -->
| Browser exports | Gzip bytes |
| --- | ---: |
| `@kasperrt/smolter/react` | 2445 |
| `@kasperrt/smolter/preact` | 2445 |
| `@kasperrt/smolter/react + @kasperrt/smolter/client` | 2782 |
| `@kasperrt/smolter/preact + @kasperrt/smolter/client` | 2781 |
| `wouter@3.13.0` | 3091 |
| `wouter-preact@3.13.0` | 2450 |
| `react-router@8.4.0` | 60994 |
<!-- size-comparison:end -->

The table is generated by `pnpm size` from all exports of each listed entry,
using production ESM bundles, esbuild, Terser, and gzip level 9. React, React DOM,
and Preact are external in every bundle. Transitive library dependencies are
included. React Router provides a broader API; this compares complete entry
sizes, not equivalent feature sets or the minimum code for one route.
`@kasperrt/smolter/client` adds browser transport for server loaders/actions; server-only
rendering code and the Vite plugin are not shipped to the browser.

Exact current measurements are generated in
[`packages/ui/src/size.json`](./packages/ui/src/size.json).

```sh
pnpm fix               # Formatting
pnpm check             # Lint, types, tests, build, size gate
pnpm coverage          # 100% lines per published source file, including browser tests
pnpm pack:smoke         # React-only and Preact-only packed installs
pnpm build:examples    # Four independent builds
pnpm smoke             # Four-app browser checks, file routing
SMOLTER_ROUTES=manual SMOLTER_TEST_PORT=4473 pnpm smoke
pnpm smoke:production  # Built SSR servers, hydration, reads, mutations
```

The CI workflow defines checks for PRs and pushes to main. Coverage must remain at 100%
for every implementation file across the core, adapters, transport, and routing
packages. Reports are uploaded as CI artifacts.

Publishing requires passing CI, including the strict size gate. Direct commits
to main are allowed until 0.0.1 exists on npm and JSR; subsequent changes require
PRs. [Release workflow](https://github.com/kasperrt/smolter/blob/main/RELEASING.md).

To test a local package build in another project:

```sh
pnpm --dir packages/smolter pack --pack-destination ../..
pnpm add /absolute/path/to/kasperrt-smolter-0.0.1.tgz
```

Workspace structure and rendering checks are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).
