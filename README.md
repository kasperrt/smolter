# smolter _

<!-- bundlejs:start -->
[![react gzip size](https://deno.bundlejs.com/?q=%40kasperrt%2Fsmolter%40latest%2Freact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react%2F*%22%5D%7D%7D&badge)](https://bundlejs.com/?q=%40kasperrt%2Fsmolter%40latest%2Freact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22react%22%2C%22react%2F*%22%5D%7D%7D&bundle)
[![preact gzip size](https://deno.bundlejs.com/?q=%40kasperrt%2Fsmolter%40latest%2Fpreact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22preact%22%2C%22preact%2F*%22%5D%7D%7D&badge)](https://bundlejs.com/?q=%40kasperrt%2Fsmolter%40latest%2Fpreact&treeshake=%5B*%5D&config=%7B%22compression%22%3A%22gzip%22%2C%22esbuild%22%3A%7B%22external%22%3A%5B%22preact%22%2C%22preact%2F*%22%5D%7D%7D&bundle)
<!-- bundlejs:end -->

A typed data router for React and Preact. **Zero browser runtime dependencies.**

Loaders read. Actions mutate. Components render. Fetchers read or submit to a
route without navigating. Successful mutations can revalidate the current
loader; `shouldRevalidate` decides when that work is needed.

Inspired by [wouter](https://github.com/molefrog/wouter)
and [React Router](https://reactrouter.com/).

[Read the documentation](https://kasperrt.github.io/smolter/docs/) for guides and the complete API reference. The prerendered site uses Preact and Smolter routes. Articles load individually; React examples remain available in the repository.

Start with [loaders](https://kasperrt.github.io/smolter/docs/loaders/), [actions](https://kasperrt.github.io/smolter/docs/actions/), [forms and validation](https://kasperrt.github.io/smolter/docs/forms/), or [fetcher reads and mutations](https://kasperrt.github.io/smolter/docs/fetchers/). Each guide connects the handler to an actual route URL and its consuming view.

## React and Preact application APIs

Both adapters expose navigation, submission, error, root-data and route-data hooks. Both server entries expose `dispatchRoute` and `renderApplication`; both client entries provide `mountApplication`, scoped transport and deployment recovery. Import `applicationPlugins` from the matching renderer's `/vite` entry for lazy file routes and development SSR.

Integrated React documents use React DOM 19+ (`react/document`, `react/client`, `react/server`). React 18 remains supported for routing hooks and manual `loadRouter` SSR. Use React's `use(promise)` inside `Suspense` for deferred rendering. Preact uses `Await` with an explicit `fallback` for early hydration. These renderer choices share transport and data ownership, without loading the other framework.

## Contents

- [Deployment updates](#deployment-updates)

- [Install](#install)
- [Try the four standalone examples](#try-the-four-standalone-examples)
- [Choose file routing or manual routes](#choose-file-routing-or-manual-routes)
- [Server and client handlers](#server-and-client-handlers)
- [Fetchers read and mutate](#fetchers-read-and-mutate)
- [Decide when to revalidate](#decide-when-to-revalidate)
- [Types follow the handler](#types-follow-the-handler)
- [Server rendering](#server-rendering)
- [Package entries](#package-entries)
- [Application integration](#application-integration)
- [Resource subscriptions](#resource-subscriptions)
- [Size and checks](#size-and-checks)
- [Routing without data hooks](#routing-without-data-hooks)

## Install

Install the scoped npm package and choose your framework explicitly:

```sh
pnpm add @kasperrt/smolter
```

```ts
import { createDataRouter, useFetcher } from "@kasperrt/smolter/react";
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

- `/`: a short introduction and a link to the docs.
- `/examples/counter`: fetcher POST, automatic and manual revalidation.
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
import { fileRouter } from "@kasperrt/smolter/react/vite";

export default defineConfig({
  plugins: [fileRouter({ directory: "src/routes" })],
});
```

```ts
// app.ts
import { createDataRouter } from "@kasperrt/smolter/react";
import routes from "virtual:smolter/routes";

export const router = createDataRouter(routes, { browser: true });
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
splats. Escape a literal dot with `[.]`: `robots[.]txt.ts` and
`robots[.]txt/route.ts` both map to `/robots.txt`. File routes derive their
identity and URL from their filename; do not export `id` or `routePath`.
Target revalidation with the generated path (or `root` for root data).
Conflicting patterns and unsupported optional/bracket syntax are rejected.

For the virtual module, add this declaration to your app:

```ts
// env.d.ts
// Include vite/client in your tsconfig types as usual.
declare module "virtual:smolter/routes" {
  const routes: import("@kasperrt/smolter/react").Route[];
  export default routes;
}
```

Outside Vite, `flatRoutes(directory)` from `@kasperrt/smolter/react/vite` returns
`{ path, file }[] | Error` for your build tool to turn into imports.

### Manual routes

```tsx
import { createDataRouter, defineRoute } from "@kasperrt/smolter/react";
import * as tasks from "./tasks/route";
import * as task from "./task/route";

export const tasksRoute = defineRoute("/tasks", tasks);
export const taskRoute = defineRoute("/tasks/:id", task);
export const routes = [tasksRoute, taskRoute];
export const router = createDataRouter(routes, { browser: true });
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

export { clientLoader } from "./clientLoader";
export { clientAction } from "./clientAction";

export { shouldRevalidate } from "./shouldRevalidate";
export { HydrateFallback } from "./HydrateFallback";
export { ErrorBoundary } from "./ErrorBoundary";
```

With the optional server integration:

- `loader` and `action` execute on the server.
- Browser navigation and submissions reach them automatically over HTTP.
- Optional `clientLoader` and `clientAction` take over browser execution. They
  may do browser-only work or call `serverLoader()` / `serverAction()`.
- SSR executes the server loader and hydration reuses that data.

```ts
// clientLoader.ts
import type { ClientLoaderArgs } from "@kasperrt/smolter/react/client";
import type { loader } from "./loader";

export async function clientLoader({ serverLoader }: ClientLoaderArgs<typeof loader>) {
  return await serverLoader();
}
```

```ts
// clientAction.ts
import type { ClientActionArgs } from "@kasperrt/smolter/react/client";
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

Data requests append `.__smolter` to the route pathname: `/users?page=2` becomes
`/users.__smolter?page=2`. Queries stay intact and mutations keep their request bodies.
The Vite and Node adapters strip the suffix before dispatching the registered handler. Both SSR examples include a working host. The host
owns authentication, session cookies, HTTP policy, and deployment.

Manual server routes use `serverRoute<typeof import("./route")>(path, clientModule)`
from `@kasperrt/smolter/react/client` in the browser and `defineRoute` on the server. This keeps
the type connection without importing server code at runtime. To use manual
tables with the dev transport:

```ts
import { routerPlugin } from "@kasperrt/smolter/react/vite";

routerPlugin({
  clientRoutes: "src/manual-browser-routes.ts",
  serverRoutes: "src/manual-routes.ts",
});
```

Each table exports `routes`. The standalone examples contain both tables.

Without the optional integration, `createDataRouter` invokes handlers locally:
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
// shouldRevalidate.ts
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

`useRevalidator()` returns an async function. Target a registered route ID or path
pattern to refresh only its active data, including loaded fetchers:

```tsx
const revalidate = useRevalidator();

await revalidate({ route: "/tasks/:id" });
await revalidate({ route: "root" });
await revalidate({ route: ["root", "/tasks/:id"] });
```

Without a target, `revalidate()` refreshes the active page, loaded fetchers, and
registered root/layout data. `shouldRevalidate` still applies. Inactive routes
are not loaded, unknown targets do nothing, and revalidation never navigates.

The Preact root integration uses `root` as its default ID. Configure its
`loaderPath` with a registered data route to enable root refreshes. Custom React
or Preact layouts can use `router.registerRevalidator(id, callback)`; call its
returned cleanup function when the layout is removed.
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
import { loadRouter, serialize } from "@kasperrt/smolter/react/server";

const router = await loadRouter(routes, incomingRequest);
const html = renderToString(
  <RouterProvider router={router}><Routes /></RouterProvider>,
);
const hydrationJSON = serialize(router.getSnapshot());
```

Create a fresh router per request. Embed the serialized snapshot in a JSON
script, restore it with `deserialize` from `@kasperrt/smolter/react/client`, and pass it as
`hydrationData` to `createDataRouter`. This preserves loader errors through hydration
without exposing server stacks or causes. Error boundaries should display the
error message, not its stack.

```ts
import { deserialize } from "@kasperrt/smolter/react/client";
import { createDataRouter } from "@kasperrt/smolter/react";
import routes from "virtual:smolter/routes";

const data = document.getElementById("smolter-data");
const router = createDataRouter(routes, {
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

Use `@kasperrt/smolter/react` for React 18+ and `@kasperrt/smolter/preact` for Preact 11.0.1+.
Choose one renderer for your application. Both expose the same routing API:

| Purpose | React | Preact |
| --- | --- | --- |
| Components, hooks, router, data types | `@kasperrt/smolter/react` | `@kasperrt/smolter/preact` |
| Optional browser transport | `@kasperrt/smolter/react/client` | `@kasperrt/smolter/preact/client` |
| SSR and HTTP data dispatch | `@kasperrt/smolter/react/server` | `@kasperrt/smolter/preact/server` |
| Vite plugin and flat-file discovery | `@kasperrt/smolter/react/vite` | `@kasperrt/smolter/preact/vite` |

`@kasperrt/smolter/utils` contains browser-safe matching and URL helpers.
The main renderer entries never import server or build modules. Named imports
are tree-shaken; optional transport is included only when you import `/client`.
Server entries do not import either UI renderer. Vite entries are build-time only.

**Migrating renderer subpaths:** replace `/core` imports for types, router factories, and
`defineRoute` with your renderer entry. Use `/utils` for `matchRoutes`,
and `internalURL`. Move `/client`, `/server`,
`/files`, and `/vite` imports to the corresponding renderer-prefixed path above.
The bare package root and old top-level subpaths are no longer exported.

See the [changelog](./CHANGELOG.md) for release history.

**Router factory migration:** code that previously used `createRouter` with
loaders, actions, fetchers or revalidation must now use `createDataRouter`.
`createRouter` now creates a navigation-only router. SSR and file-router
application helpers select `createDataRouter` automatically.

On JSR, install `@kasperrt/smolter` using the
[JSR package instructions](https://jsr.io/docs/npm-compatibility) and import
`@kasperrt/smolter/react` or `@kasperrt/smolter/preact`. Its renderer, client, server and utility subpaths match npm. The Vite plugin is npm-only:
use `@kasperrt/smolter/react/vite` from the npm package when adding file routing.

## Application integration

Import routing, forms and data hooks from `@kasperrt/smolter/preact`.
Document rendering is optional: `@kasperrt/smolter/preact/document` supplies
`Document`, `Meta`, `Links`, `Scripts` and `ScrollRestoration`.
`@kasperrt/smolter/preact/client` supplies `mountApplication`,
`configureApplication` and the server transport helpers. Mounting connects
hydration, root data and navigation presentation to the same core router.
These modules remain tree-shakable; basic routing does not import the document
or mounting code. The size table also measures all three together, because
moving APIs to subpaths does not make their implementation disappear.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { applicationPlugins } from "@kasperrt/smolter/preact/vite";

export default defineConfig({
  plugins: applicationPlugins({ directory: "src/routes" }),
});
```

```tsx
// src/entry.client.tsx
import routes from "virtual:smolter/routes";
import { mountApplication } from "@kasperrt/smolter/preact/client";
import * as root from "./root";

mountApplication(routes, root);
```

`root` exports a default component containing `Outlet` and a `Layout` wrapping
it in `Document`, a head, and a body containing `Scripts`. Its optional loader
supplies root data. `renderApplication(request, routes, root, entry)` from
`preact/server` renders the same tree and serializes hydration data;
`dispatchRoute(request, routes)` handles route data requests. Server rendering
requires the optional `preact-render-to-string` peer.

Deployment-specific URL mapping can be configured once at startup with
`configureApplication({ resolveURL, isDocumentHandoff, leaveDocument,
entryScript })`. Do not put user-specific or request-specific state there.
The library does not define application domains, ports, or branding.

`utils/http` contains the Node request/response adapter; `utils/assets` contains
manifest/preload helpers; `utils/responses` contains response normalization.
Keep the first two in server/build entrypoints. Browser application imports do
not include them.

### Virtual modules and entrypoints

`virtual:smolter/routes` is the default route-array export generated by the Vite
plugin from `src/routes`. It is not a physical file or a runtime package.
The server build retains loaders/actions; the browser build strips their
re-exports and installs server proxies. `entry.client.tsx` and `entry.server.tsx`
are application-owned files wiring those manifests to hydration and SSR.
Manual tables can be imported directly instead.

See the [virtual routes guide](https://kasperrt.github.io/smolter/docs/virtual-routes)
for the exact contract, TypeScript declaration, and both entrypoint examples.

### Express hosting

Keep Express in control of metrics, tracing, authentication and static files.
Mount `createRequestHandler({ build, entry })` from
`@kasperrt/smolter/utils/http` after those middleware. `build` is the compiled
server entry and `entry` is the browser entry URL from Vite's manifest. Do not
consume request bodies with Express body parsers before this handler.
The adapter has no Express dependency and forwards failures to `next(error)`.

See the [Express guide](https://kasperrt.github.io/smolter/docs/express)
for a complete server example and streaming and hydration behavior.

## Viewport prefetching

Both adapters support code prefetching on intent (the default) or viewport entry.
Data prefetching is opt-in and uses the existing route loader and transport:

```tsx
<Link to="/tasks" prefetch="viewport" prefetchData>Tasks</Link>
<Link to="/settings" prefetch="intent">Settings</Link>
<Link to="/private" prefetch="none">Private</Link>
```

Smolter's Vite `fileRouter()` and `applicationPlugins()` infer capabilities from
application TypeScript/JSX and imported source using Smolter’s own pinned stable TypeScript 6 compiler-API
dependency (`typescript-compiler`). Your application can use TypeScript 7 independently; the
compiler is only loaded by Vite tooling and never enters browser bundles. No capability imports or router setup are needed.

A plain Link uses intent. Viewport-only usage omits intent handlers; intent-only
usage omits viewport observation. `prefetch="none"` uses neither. Typed unions and
spreads retain every possible mode, and data caching is included when prefetchData
can be true or a programmatic router.prefetch call is present. Later JSX attributes
override earlier spreads. Broad/opaque values and Link passed as a component value
retain all capabilities. This analysis is conservative, not a promise that arbitrary
runtime code can be inferred. Other bundlers retain all implementations for correctness.

Use `prefetch="none"` to disable speculative work. `prefetchData` requires
`createDataRouter`; a navigation-only router can preload code but has no loaders.
Loaders receive `reason: "prefetch"`. Only opt in for safe reads, and treat this
reason like initial navigation when choosing initial pagination. Actions and root
loaders are never prefetched.

The router keeps at most 16 URL-specific reads for 30 seconds, with no polling or
background refresh. Navigation consumes fresh data once, including an in-flight
request. Mutations and explicit revalidation invalidate the cache. Errors and
redirects are retried on navigation and cannot trigger speculative recovery.
Viewport observation ends on entry or unmount; unsupported browsers skip it.

## Independent data requests

Both adapters include `useFetcher`, `useSubmit`, `Form` and the loader/action hooks
in their main entrypoint. Use `createDataRouter` for data routes and `useFetcher`
for reads or mutations that should not navigate the page. There is no separate
React resource router or `/react/data` entrypoint.

```tsx
import { useFetcher } from "@kasperrt/smolter/react";

function Settings() {
  const settings = useFetcher();
  return (
    <settings.Form method="post" action="/settings">
      <input name="name" aria-label="Profile name" />
      <button disabled={settings.state !== "idle"}>Save</button>
    </settings.Form>
  );
}
```

Use the same imports from `/preact` in a Preact application. Independent
fetchers share the application router's cancellation, revalidation and deployment
recovery ownership; they do not require another provider or store.

## Size and checks

| Need | Public import |
| --- | --- |
| Navigation only | `@kasperrt/smolter/react` or `/preact`, using `createRouter` |
| Loaders, actions, forms and fetchers | Same entry, using `createDataRouter` |
| Browser server-request transport | Renderer `/client` subpath |
| Preact application hydration | `@kasperrt/smolter/preact/client` |
| Preact document components | `@kasperrt/smolter/preact/document` |
| Lazy Preact route modules | `@kasperrt/smolter/preact/lazy-route` |
| Server rendering / Vite integration | Renderer `/server` / `/vite` subpaths; keep out of browser imports |

The measurements below describe retained exports, not the cost of an import
statement. Browser transport rows include the router and transport together;
application rows include the listed modules together. Server and Vite modules
have no browser cost when kept in their intended server/build entrypoints.

Use `createRouter` for navigation only, or `createDataRouter` for loaders,
actions, fetchers and revalidation. Both are named exports from
`@kasperrt/smolter/preact` and `/react`. No extra package or plugin is required.
The production bundler can remove the data engine when only `createRouter` is used.

`pnpm size` regenerates this table and the site's size data using identical
minifiers. The routing-only gate compares our selected exports with wouter's
routing subset: `Router`, `Route`, `Switch`, `Link`, `useParams`, and `useLocation`.
Both complete wouter entries are reported too. The APIs differ; this is not
a claim of identical features.

<!-- size-comparison:start -->
| Browser exports | Gzip bytes |
| --- | ---: |
| `React Router: declarative routing subset` | 12882 |
| `React Router: data routing subset` | 29780 |
| `React: routing-only named exports` | 1855 |
| `Preact: routing-only named exports` | 1838 |
| `@kasperrt/smolter/react` | 5847 |
| `@kasperrt/smolter/preact` | 6124 |
| `@kasperrt/smolter/react + server transport (named client exports)` | 7562 |
| `@kasperrt/smolter/preact + server transport` | 7849 |
| `@kasperrt/smolter/react + client + document (application)` | 10680 |
| `@kasperrt/smolter/react + client + document + lazy-route` | 10966 |
| `@kasperrt/smolter/preact + client + document (application without lazy routes)` | 11005 |
| `@kasperrt/smolter/preact + client + document + lazy-route (file-routed application)` | 11300 |
| `React: common routing/data exports` | 4135 |
| `Preact: common routing/data exports` | 4116 |
| `wouter: routing subset (Router, Route, Switch, Link, useParams, useLocation)` | 2854 |
| `wouter-preact: same routing subset` | 2211 |
| `wouter@3.13.0` | 3091 |
| `wouter-preact@3.13.0` | 2450 |
| `react-router@8.4.0` | 60994 |
<!-- size-comparison:end -->

The common-export rows measure the same named API set: `createDataRouter`,
`defineRoute`, `RouterProvider`, `Routes`, `Link`, `Form`, `useRouter`,
`useLoaderData`, `useActionData`, `useParams`, `useLocation`,
`useRevalidator` and `useFetcher`. Preact’s link and submission APIs currently
have additional behavior; equal names do not imply identical implementations.
React Router's declarative subset retains `BrowserRouter`, `Routes`, `Route`,
`Link`, `useParams`, and `useLocation`. Its data subset retains
`createBrowserRouter`, `RouterProvider`, `Link`, `Form`, `useLoaderData`,
`useActionData`, `useParams`, `useLocation`, `useRevalidator`, and `useFetcher`.
React Router has no dedicated Preact entry; these are React API measurements,
not a Preact compatibility build. The selected APIs have different capabilities.

The routing-only rows retain `createRouter`, `defineRoute`, `RouterProvider`,
`Routes`, `Link`, `useParams` and `useLocation`. Full Preact also exposes richer
application APIs. These tiers overlap: do not add the rows together.

The table is generated by `pnpm size` from the named subsets above or all exports of each other listed entry,
using production ESM bundles, esbuild, Terser, and gzip level 9. React, React DOM,
and Preact are external in every bundle. Transitive library dependencies are
included. React Router provides a broader API; this compares complete entry
sizes, not equivalent feature sets or the minimum code for one route.
`@kasperrt/smolter/react/client` adds browser transport for server loaders/actions; server-only
rendering code and the Vite plugin are not shipped to the browser.

### Routing without data hooks

```tsx
import { render } from "preact";
import {
  createRouter,
  defineRoute,
  Link,
  RouterProvider,
  Routes,
} from "@kasperrt/smolter/preact";
import Home from "./routes/home";
import About from "./routes/about";

const router = createRouter([
  defineRoute("/", { default: Home }),
  defineRoute("/about", { default: About }),
], { browser: true });

render(
  <RouterProvider router={router}>
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
    </nav>
    <Routes />
  </RouterProvider>,
  document.getElementById("app")!,
);
```

Add `useParams` for dynamic paths such as `/tasks/:id` and `useLocation` for
the current URL. Both are included in the routing-only measurement, even though
this example does not need them. Switch the factory to `createDataRouter` when
adding loaders, actions or fetchers, importing it from the same entry. SSR hydration and file-routed applications use the
larger client/document/lazy-route tier; they are not represented by the routing-only number.

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
pnpm pack
pnpm add /absolute/path/to/kasperrt-smolter-0.0.1.tgz
```

Workspace structure and rendering checks are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Deployment updates

For production tabs that survive a deployment, add `deploymentPlugin()` from
`@kasperrt/smolter/react/vite` or `/preact/vite`, then connect the router:

```ts
import deployment from "virtual:smolter/deployment";
import { watchDeployment } from "@kasperrt/smolter/preact/client";

watchDeployment(router, deployment);
```

Serve the emitted `smolter-manifest.json` with `Cache-Control: no-store` and HTML
with `no-cache`. Builds have deterministic content identities. Lazy file-route builds
also carry shared and per-route dependency fingerprints: an unrelated route change
does not reload a compatible destination. Shared changes, changed/missing destinations,
and builds without route metadata retain conservative destination reloads. Routine checks
run in the background without delaying navigation or Back/Forward. A discovered change
is applied on the next eligible navigation; a late response never reloads a successfully
rendered page. Completed checks, including failures, are reused for 30 seconds
(`checkInterval` overrides this). Missing-chunk failures bypass that interval and can recover even when route fingerprints match. Hash-only links skip the check, failed checks continue
normally, and a session marker prevents reload loops. Development/SSR builds
disable the helper. This optional client module adds nothing to the routing-only
entrypoints and never replays form submissions.

Fingerprints cover the browser module graph, including route styles/assets and raw files present in that graph. Server-only dependencies outside that graph require an explicit `deploymentPlugin({ compatibility: "server-contract-v2" })` change when their contract becomes incompatible. The key is optional and stable across ordinary data updates. Changing it requires rebuilding and deploying the frontend and manifest; the new frontend must already support the changed contract. It cannot detect backend deployments automatically or repair incompatible code. Retain old hashed assets during deployments; missing assets can still require recovery. No route module is hot-swapped between deployments.

See [deployment updates](https://kasperrt.github.io/smolter/docs/deployments/)
for Express, CDN paths, TypeScript declarations and unsaved-state handling.


### Shared origins and streaming SSR

The default route suffix preserves application prefixes: `/admin/users.__smolter` dispatches `/admin/users`. Reserve this suffix in Express and static routing, and apply authentication to both document and data requests. File routing rejects statically declared suffix collisions; arbitrary Express routes and dynamic parameter values remain host-owned. Explicit `dataEndpoint` configuration retains the legacy query transport for migration and must agree across browser, Vite and production. Transport responses, including errors and redirects, use `Cache-Control: private, no-store`.

Pass deployment metadata before mounting so recovery covers the initial route import:

```ts
import deployment from "virtual:smolter/deployment";
import { mountApplication } from "@kasperrt/smolter/preact/client";

await mountApplication(routes, root, { deployment });
```

Preact SSR starts root and route loaders concurrently. Return nested promises and use `Await` with an explicit `fallback` for component-owned pending content during early hydration. The Node/Express adapter streams the response; hydration starts after the document stream finishes by default. Pass `{ earlyHydration: true }` to `renderApplication` to hydrate the shell while optional promises stream independently. Initial deferred values share a total 30-second budget after their payload is read, not an inactivity timeout or reliable disconnect detector. Settlements do not extend it; configure `mountApplication` with `{ deferredTimeout: 60_000 }` for intentionally slower data (integer milliseconds from 1 through 2147483647; invalid values throw RangeError). A broken document can emit no completion event, so this deadline rejects unfinished values without retrying requests. Root-loader failures render the root error boundary. Vite development HTML transformation still buffers the document.

Successful action redirects refresh registered root data without replaying the mutation. Loader arguments expose `reason` to distinguish initial loads, navigation, revalidation and fetcher reads without comparing browser URLs.


### Document hydration and injected tags

Preact hydrates after document completion by default. For an interactive shell while optional data is pending:

```ts
return renderApplication(request, routes, root, entry, {
  earlyHydration: true,
  nonce,
});
```

Keep optional nested promises inside `Suspense` and `Await`. The browser entry runs asynchronously; each deferred result settles without rerunning the initial loader. Required top-level loader data still blocks the shell. Use production streaming hosting; Vite development HTML transformation buffers. Measure a successful interaction rather than treating TTFB or DOMContentLoaded as hydration completion.

Infrastructure that injects direct children of `<head>` can mark those external nodes with `data-smolter-preserve`. Smolter excludes them from positional hydration and restores the same nodes afterward. Do not also render them in the application layout. Unmarked HTML rewriting, body injection and changes to the hydration payload are not supported.

```html
<script data-smolter-preserve src="/infrastructure-instrumentation.js"></script>
```

The generated route asset manifest follows static imports for each route and leaves optional dynamic imports lazy. Serve the matched route's preload hints with the correct asset base; do not preload every route to reduce a waterfall. Chunk counts and total emitted bytes alone do not establish initial-load latency.


### Matched-route asset hints

The file-router build emits `.vite/route-assets.json` with each route's static JavaScript dependency closure and its CSS in `styles`. `routePreloads` from `@kasperrt/smolter/utils/assets` produces modulepreload hints for JavaScript and `preload; as=style; crossorigin` hints for CSS (matching Vite’s anonymous CORS mode), respecting your CDN/base URL. Set these hints on the document response or send Early Hints from your host. Stylesheet preloads fetch files; they do not apply styles. Keep the application stylesheet links and Vite's CSS handling in place. Optional dynamic imports are excluded, and unrelated routes stay lazy.

Root stylesheet URL imports such as `import stylesUrl from "./index.css?url"` are not route CSS imports. Keep rendering `<link rel="stylesheet" href={stylesUrl}>` in the root document; an empty route `styles` array is expected when all CSS is loaded this way. Smolter does not infer stylesheet use from arbitrary asset URLs. If measurements show late root CSS discovery, your host can send an explicit preload or Early Hint for that same resolved URL, with the same CORS mode as the stylesheet link. Preloading does not replace the stylesheet link. Do not reorganize CSS merely to populate the route manifest.


### Component-owned deferred loading

For early Preact hydration, pass pending content directly to the built-in `Await`:

```tsx
import { Await } from "@kasperrt/smolter/preact";

<Await resolve={data.stats} fallback={<p>Loading statistics…</p>}
  errorElement={<p>Statistics unavailable.</p>}>
  {(stats) => <Stats value={stats} />}
</Await>
```

Replace the surrounding native `Suspense` for each deferred section, including root sections. This uses ordinary component-owned fallback HTML and the existing deferred data stream, avoiding Preact 11.0.1's abandoned streamed-boundary problem. No separate entrypoint, dependency patch, DOM cleanup, extra request or polling is needed. Late results cannot update an unmounted owner. Early-mode resolved content requires JavaScript; ordinary SSR without early hydration still streams resolved HTML. Existing `Await` without `fallback` keeps its Suspense semantics and its known early-hydration limitation. This does not repair arbitrary native Suspense/lazy boundaries.
