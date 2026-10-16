# smolter _

A tiny, typed data router for React and Preact. **Zero runtime dependencies.**

Keep data out of deeply nested components: loaders read, actions mutate, and
components render. Fetchers call a route without navigating. Successful actions
revalidate the current page's loader automatically.

**Unreleased · 0.0.1.** Inspired by [wouter](https://github.com/molefrog/wouter)
and [React Router](https://reactrouter.com/). Not published to npm or JSR yet.

## Define paths first

Every handler belongs to an explicitly registered route. Importing a route module
picks up its named exports; there is no filename convention or build plugin.

```tsx
// routes.ts
import { createRouter, defineRoute } from "smolter";
import * as tasks from "./tasks/route";
import * as task from "./task/route";
import * as files from "./files/route";

export const tasksRoute = defineRoute("/tasks", tasks);
export const taskRoute = defineRoute("/tasks/:id", task);
export const routes = [
  tasksRoute,
  taskRoute,
  defineRoute("/files/*", files),
];
export const router = createRouter(routes, { browser: true });
```

| URL | Route | Handler params |
| --- | --- | --- |
| `/tasks` | `/tasks` | `{}` |
| `/tasks/42` | `/tasks/:id` | `{ id: "42" }` |
| `/files/docs/start` | `/files/*` | `{ "*": "docs/start" }` |

First match wins. Put specific routes before catch-alls. Trailing slashes are
ignored. Query parameters are available through `new URL(request.url).searchParams`.
Routes form a flat table, without nested layout matching.

```tsx
// app.tsx
import { Link, RouterProvider, Routes } from "smolter";
import { router } from "./routes";

export function App() {
  return <RouterProvider router={router}>
    <Link href="/tasks">Tasks</Link>
    <Routes />
  </RouterProvider>;
}
```

For Preact, use the same exports from **`smolter/preact`**. That adapter uses
Preact, never React. Headless APIs live in `smolter/core`; SSR helpers live in
`smolter/server`.

## Four handlers, on the same route

A module can export **all four**. Client handlers do not replace or remove the
ordinary handlers from the route definition.

```tsx
// task/route.tsx
export { loader } from "./loader";
export { action } from "./action";
export { clientLoader } from "./client-loader";
export { clientAction } from "./client-action";
export { default } from "./view";
export { HydrateFallback } from "./components/hydrate-fallback";
export { ErrorBoundary } from "./components/error-boundary";
```

| Operation | Client router | Server router (`loadRouter`) |
| --- | --- | --- |
| Read / navigate / revalidate | `clientLoader`, falling back to `loader` | `loader` |
| POST / PUT / PATCH / DELETE | `clientAction`, falling back to `action` | `action` |

Only the selected handler runs; they are not called in sequence. Client handlers
never execute in server mode. Server-loaded data is reused during hydration;
subsequent client navigation or revalidation selects the client handler.

**Execution and HTTP are separate.** A fetcher invokes the matching registered
handler. It does not itself send an HTTP request. A client handler can call your
API, read browser storage, or compute a value. `loader` and `action` are universal
fallbacks, not automatically generated backend endpoints. To keep them strictly
server-side, register them only in your server route table; register the matching
client handlers in your browser table. This package does not strip server imports
or provide `serverLoader()` / `serverAction()` RPC callbacks.

For example, the client handlers for `/tasks/:id` can call a backend:

```ts
// task/client-loader.ts
import type { DataArgs } from "smolter";

interface Task { id: string; title: string }

export async function clientLoader({ params, signal }: DataArgs) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(params.id)}`, {
    signal,
  });
  if (!response.ok) return new Error("Could not load task");
  return await response.json() as Task;
}
```

```ts
// task/client-action.ts
import type { DataArgs } from "smolter";

export async function clientAction({ request, params, signal }: DataArgs) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(params.id)}`, {
    method: request.method, // POST, PUT, PATCH, or DELETE from the fetcher
    body: await request.formData(),
    signal,
  });
  if (!response.ok) return new Error("Could not save task");
  return { saved: true, id: params.id };
}
```

`loader` and `action` receive the same `{ request, params, signal }` arguments.
On the server they can call your server-side data layer. Forward `signal` to
fetches so superseded work can be cancelled.

## Fetchers target routes

A fetcher on `/tasks` can submit to `/tasks/42`. That matches the registered
`/tasks/:id` route and calls its action with `params.id === "42"`.

```tsx
// A component rendered on /tasks
import { useFetcher } from "smolter";
import type { clientAction } from "../task/client-action";

export function RenameTask() {
  const fetcher = useFetcher<typeof clientAction>();

  return <fetcher.Form action="/tasks/42" method="patch">
    <input name="title" defaultValue="Write the docs" />
    <button type="submit" disabled={fetcher.state !== "idle"}>Save</button>
    {fetcher.data?.saved && <p>Saved task {fetcher.data.id}</p>}
    {fetcher.error && <p role="alert">{fetcher.error.message}</p>}
  </fetcher.Form>;
}
```

The flow is:

1. Match `/tasks/42` against `/tasks/:id`.
2. Call that route's `clientAction` (or `action` fallback) with a PATCH `Request`.
3. The example handler sends PATCH `/api/tasks/42` to your backend.
4. Store the handler result in this fetcher's `data`.
5. Revalidate the active `/tasks` loader. The URL stays `/tasks`.

POST works the same way: `<fetcher.Form action="/tasks" method="post">`
calls the action registered on `/tasks`. A handler-only resource route does not
need a default component.

Programmatic reads and mutations use concrete URLs too:

```tsx
const fetcher = useFetcher(taskRoute); // inferred loader + action result types

await fetcher.load("/tasks/42"); // that route's loader; no navigation

const body = new FormData();
body.set("title", "Updated title");
await fetcher.submit(body, { action: "/tasks/42", method: "PATCH" });
await fetcher.submit(body, { action: "/tasks/42", method: "POST" });
```

`useFetcher(taskRoute)` binds types and a default target. For a static route,
that target is its path. For the active parameterized route, it uses the current
concrete URL. **When targeting a different ID, pass the concrete URL explicitly**;
`/tasks/:id` is a pattern, not a destination.

Without a route argument or explicit target, the fetcher uses the current URL.
Each fetcher owns independent `data`, `error`, and `state` (`idle`, `submitting`,
`loading`). Fetcher data does not populate `useActionData()`.

## Types follow handlers

Pass a route to infer data without repeating a data interface:

```tsx
import { defineRoute, useLoaderData, useActionData } from "smolter";

const counterRoute = defineRoute("/counter", {
  loader: () => ({ count: 1 }),
  action: () => ({ saved: true }),
  default: Counter,
});

function Counter() {
  const data = useLoaderData(counterRoute); // { count: number } | undefined
  const result = useActionData(counterRoute); // { saved: boolean } | undefined
  return <p>{data?.count} {result?.saved && "Saved"}</p>;
}
```

This is also the manual definition style: handlers may be supplied directly
instead of imported as module exports. Remember to include `counterRoute` in
the array passed to `createRouter`.

Inside a route module, function types avoid circular imports:

```tsx
import { useLoaderData, useActionData } from "smolter";
import type { clientLoader } from "./client-loader";
import type { clientAction } from "./client-action";

const data = useLoaderData<typeof clientLoader>();
const result = useActionData<typeof clientAction>();
```

These hook calls belong inside your component. TypeScript cannot infer an
unrelated nearby export from its filename: the route argument or `typeof`
connects the hook to the handler. Route-based inference includes both ordinary
and client handler return types when both exist. A function generic selects
that function's type; use the route-based form if the two return different shapes.
Returned `Error` values are excluded from data types. Data is optional before
loading or submitting.

## Navigation, forms, and revalidation

- `<Form action="/tasks/42" method="patch">` navigates to its target, stores the
  result for `useActionData()`, and reloads the destination loader.
- `<fetcher.Form>` performs the same mutation without navigation and keeps the
  result in `fetcher.data`.
- `<Form method="get">` builds a query string and navigates. A fetcher GET form
  loads its target without navigation.
- Both forms support named submit buttons and `formaction` / `formmethod`
  overrides. PUT, PATCH, and DELETE require JavaScript.
- `const revalidate = useRevalidator(); await revalidate()` refreshes the current
  route manually. Successful actions do this automatically.
- `shouldRevalidate({ url, reason })` can return `false` for `"action"` or
  `"manual"` revalidation. Navigation always loads its destination.
- `useLocation()` returns `[url, navigate]`; `navigate(url, { replace: true })`
  replaces history. `useParams()` reads current path parameters.
- Return an `Error` or reject a handler to report failure. Fetcher errors remain
  local; route errors render `ErrorBoundary({ error })`, or the error message.
- Return a `Response` with a `Location` header to redirect. Fetcher redirects
  also navigate. A data error boundary does not catch component render errors.

## Server rendering

Create a fresh router for each request. Server mode selects `loader` and
`action`, never their client counterparts.

```tsx
import { renderToString } from "react-dom/server";
import { RouterProvider, Routes } from "smolter";
import { loadRouter, serialize } from "smolter/server";
import { routes } from "./server-routes";

const router = await loadRouter(routes, incomingRequest);
const html = renderToString(
  <RouterProvider router={router}><Routes /></RouterProvider>,
);
const hydrationJSON = serialize(router.getSnapshot());
```

Embed `hydrationJSON` in a JSON script element. On the client, parse it and pass
`hydrationData` to `createRouter(clientRoutes, { browser: true, hydrationData })`,
then hydrate with React or Preact. Existing data is reused without loading again.
A client-only route renders `HydrateFallback` on the server and loads after
hydration. See `apps/demo/src/server.tsx` and `hydrate.tsx` for the working example.

`loadRouter` prepares a read; it does not automatically dispatch incoming POSTs.
Your HTTP adapter may call `router.submit(url, formData, { method: "PATCH" })`
on a server-mode router to invoke a registered `action`. The host server owns
HTTP endpoints, response statuses, authentication, CSRF, and redirect responses.
Incoming request headers are forwarded to handlers. Keep server-only imports
out of browser route tables. Serialized data must be JSON-compatible; errors
are omitted and script-closing characters escaped.

## Try 0.0.1

```sh
pnpm install
pnpm build
pnpm dev
```

Open `http://127.0.0.1:5173`, `/preact.html`, or `/ssr`. All three use the same
UI. Add one sends POST `/api/counter`, then revalidation sends GET `/api/counter`.
Counters are isolated by browser cookie and survive reloads until server restart.

To install the unpublished package in another project:

```sh
pnpm --dir packages/smolter pack --pack-destination ../..
pnpm add /absolute/path/to/smolter-0.0.1.tgz
```

Install React 18+ or Preact 10+ alongside it. Both are optional peers; only the
framework you use is needed. Version stays **0.0.1** until an actual release.

## Size and development

`pnpm size` compares all browser exports with pinned wouter baselines using the
same esbuild + Terser + gzip settings. Dependencies are included; framework
runtimes are excluded. CI requires both adapters to be strictly smaller than
their corresponding wouter entry and below 2,500 bytes gzip.

| Full browser entry | smolter | Baseline |
| --- | ---: | ---: |
| React | 2,436 B | wouter 3.13.0: 3,091 B |
| Preact | 2,442 B | wouter-preact 3.13.0: 2,450 B |

The server entry is separate. These are full-entry measurements, not single-hook
headline sizes. Run `pnpm size` to reproduce them.

```sh
pnpm fix          # Biome
pnpm check        # lint, types, unit/SSR tests, build, size gate
pnpm pack:smoke   # isolated React-only and Preact-only package installs
pnpm exec playwright install chromium
pnpm smoke        # browser forms, requests, navigation, SSR, layout stability
```

GitHub Actions runs on PRs and main pushes, with Node 22/24 checks and Chromium
smoke tests. [RELEASING.md](./RELEASING.md) covers release and JSR preparation.
The private `packages/ui` supplies all demo UI; it adds nothing to the router.

Current scope excludes nested loader chains, caching, streaming, optional/regex
paths, navigation blockers, scroll restoration, and generated backend endpoints.
