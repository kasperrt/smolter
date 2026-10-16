# smolter ✳

A small, typed data router for React and Preact. **Zero runtime dependencies.**
Loaders read, actions write, and fetchers submit without navigating. Successful
actions automatically revalidate the active loader.

Inspired by [wouter](https://github.com/molefrog/wouter) and the
[React Router data model](https://reactrouter.com/start/data/route-object).
This is an independent implementation, with a deliberately smaller feature set.

## Try it

```sh
pnpm install
pnpm build
pnpm dev
```

Open `http://127.0.0.1:5173` for React, `/preact.html` for Preact, and `/ssr`
for a server-rendered page with hydration. The counter is an in-memory demo;
a browser reload resets it. No backend or credentials are needed.

This private repository contains version **0.1.0**. It is not published to npm
or JSR. To test in another project:

```sh
pnpm --dir packages/smolter pack --pack-destination ../..
# In your app:
pnpm add /absolute/path/to/smolter-0.1.0.tgz
```

## Imports

```tsx
import {
  createRouter, defineRoute, RouterProvider, Routes,
  Link, Form, useFetcher, useLoaderData, useActionData,
  useParams, useLocation, useRevalidator, useRouter,
} from "smolter";
```

Preact uses exactly the same API from **`smolter/preact`**. It imports
`preact/compat`, never React. React 18+ and Preact 10+ are optional peers; install
only the framework you use. The headless API is available from `smolter/core`.
Server preparation helpers live in `smolter/server` and stay out of browser bundles.

## Route modules

A route module exports `loader`, `action`, and its default component. Register
the namespace once; the router discovers those exports automatically.

```tsx
// routes.ts
import { createRouter, defineRoute } from "smolter";
import * as counter from "./counter/route";

export const counterRoute = defineRoute("/", counter);
export const router = createRouter([counterRoute], { browser: true });
```

```tsx
// counter/loader.ts
export async function loader() {
  const response = await fetch("/api/count");
  const data: { count: number } = await response.json();
  return data;
}
```

```tsx
// counter/action.ts
import type { DataArgs } from "smolter";

export async function action({ request, signal }: DataArgs) {
  const response = await fetch("/api/count", {
    method: "POST", body: await request.formData(), signal,
  });
  return { saved: response.ok };
}
```

```tsx
// counter/route.tsx
import { useFetcher, useLoaderData } from "smolter";
import type { loader } from "./loader";
import type { action } from "./action";
export { loader } from "./loader";
export { action } from "./action";
export { HydrateFallback } from "./components/hydrate-fallback";

export default function Counter() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return <fetcher.Form>
    <button type="submit" disabled={fetcher.state !== "idle"}>
      Count: {data?.count}
    </button>
    {fetcher.data?.saved && <p>Saved!</p>}
  </fetcher.Form>;
}
```

```tsx
// app.tsx
import { RouterProvider, Routes } from "smolter";
import { router } from "./routes";

export function App() {
  return <RouterProvider router={router}><Routes /></RouterProvider>;
}
```

`HydrateFallback` is a component exported from its own file. Export
`ErrorBoundary` to render loader/action errors; it receives `{ error: Error }`.
Without it, `Routes` displays the error message. It handles data failures,
not exceptions thrown while rendering components.

There is no file-system crawler, compiler plugin, or generated route manifest.
Explicit module registration works in any bundler. A Vite application may also
use `import.meta.glob` to build its own route table at build time.

## Manual definitions and automatic inference

```tsx
const counter = defineRoute("/counter", {
  loader: async () => ({ count: 12 }),
  action: async () => ({ saved: true }),
  default: Counter,
});

function Counter() {
  const data = useLoaderData(counter); // { count: number } | undefined
  const result = useActionData(counter); // { saved: boolean } | undefined
  const fetcher = useFetcher(counter); // loader/action result union
  // ...
}
```

A hook cannot infer the surrounding route from an unrelated module export in
TypeScript alone. Passing the route supplies that connection with **no manual
data interface or generic argument**. Within a module, `typeof loader` and
`typeof action` avoid circular imports. `undefined` accounts for loading and
an action that has not yet run. For a fetcher that only submits actions, use
`useFetcher<typeof action>()` for its narrower data type.

Data handlers receive `{ request, params, signal }`. The signal is aborted when
a newer operation supersedes the request. Handlers must pass it to their own
fetches if the underlying network request should also be cancelled.

## Forms, fetchers, and revalidation

- `<Form method="post">` calls the matching action, navigates to its target,
  retains action data, and refreshes the active loader.
- `<fetcher.Form>` calls the action and refreshes the active loader **without
  navigation**. Each hook owns independent `data`, `error`, and `state`.
- `state` is `idle`, `submitting`, or `loading` (including revalidation).
- `<Form method="get">` builds a query string and navigates through the loader.
- `fetcher.load("/resource")` reads another loader without navigation.
- `fetcher.submit(formData, { action: "/resource", method: "POST" })` submits
  programmatically. The default target is the current route or supplied route.
- Named submit buttons are included in `FormData`; `formaction` and `formmethod`
  overrides work. Forms support POST, PUT, PATCH, and DELETE in JavaScript.
- `const revalidate = useRevalidator(); await revalidate()` refreshes manually.
- Export `shouldRevalidate({ url, reason })` to opt out. Reasons are `action`
  and `manual`. URL navigation always loads its destination.
- Return an `Error`, or reject a handler, to surface an operation error. Rejected
  errors are wrapped with their original `cause`. Fetcher errors stay local.
- Return a `Response` with a `Location` header for a redirect. A redirect from a
  fetcher navigates too. Redirect chains are bounded.

`Link` preserves modified clicks, downloads, external URLs, and targets.
`useLocation()` returns `[pathnameWithSearchAndHash, navigate]`.
`navigate(url, { replace: true })` replaces browser history.

Routes are ordered, **first match wins**. Supported patterns are static paths,
`:params`, and a terminal `*` splat. Trailing slashes are ignored. Put specific
routes before a catch-all. Parameterized fetcher routes use the current concrete
URL when active; pass `action` or a load URL when targeting another concrete ID.

## Server rendering

Create a **new router for every request**. No browser globals are needed.

```tsx
import { RouterProvider, Routes } from "smolter";
import { loadRouter, serialize } from "smolter/server";
import { renderToString } from "react-dom/server";

const router = await loadRouter(routes, incomingRequest); // Request or URL string
const snapshot = router.getSnapshot();
const html = renderToString(
  <RouterProvider router={router}><Routes /></RouterProvider>,
);
const hydrationJSON = serialize(snapshot);
```

On the client, parse the serialized snapshot and pass it as
`createRouter(routes, { browser: true, hydrationData })`, then use `hydrateRoot`
(or Preact's `hydrate`). Initial hydration reuses data without loading again.
`serialize` escapes script-closing HTML characters. Data must be JSON serializable.
It omits errors: handle errors on the server rather than hydrating failed requests.
The demo's `server.tsx` and `hydrate.tsx` contain a complete working example.

Incoming request headers are forwarded to loaders. HTTP status codes, server
redirect responses (compare the final snapshot URL), authentication, CSRF,
and POST endpoints belong to the host server. This package does not generate
RPC endpoints or remove server-only imports from client bundles. Keep secrets
and database code in your server; browser handlers call your own API.

## Size is a test

`pnpm size` measures **every export in each browser entry**, with identical
esbuild + Terser production settings and gzip. Runtime dependencies are included;
only React/Preact are externalized. It compares against pinned `wouter@3.13.0`
and `wouter-preact@3.13.0`, and fails if smolter is not strictly smaller than
**both corresponding baselines**, or if either adapter exceeds 2,500 bytes.
Run the command for exact measured bytes; CI runs it on every PR and main push.

This is a complete-entry comparison, not a comparison against wouter's smaller
README headline or a cherry-picked single-hook import. The optional server
entry and your framework are additional. Importing fewer features can tree-shake
more code. There are no runtime dependencies; benchmark tools are dev-only.

## Scope of 0.1

Flat exclusive route matching, client data handlers, framework adapters, browser
history, server preloading/hydration, forms, fetchers, and revalidation. Nested
layout chains, parallel nested loaders, lazy module loading, optional/regex path
syntax, caches, streaming, navigation blockers, scroll restoration, and automatic
server endpoint generation are intentionally outside this first version.

## Development

```sh
pnpm fix          # Biome; no ESLint or Prettier
pnpm check        # lint, typecheck, unit/SSR tests, build, size comparison
pnpm pack:smoke   # separate packed installs with React-only and Preact-only peers
pnpm exec playwright install chromium
pnpm smoke        # real browser forms, navigation, and SSR hydration
```

GitHub Actions runs checks and packed installs on Node 22 and 24, plus Chromium
smoke tests. See [RELEASING.md](./RELEASING.md) for versioning and JSR preparation.
