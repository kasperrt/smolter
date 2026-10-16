# Working on smolter

Run `pnpm install` and `pnpm build` from the repository root. `pnpm dev` starts
all four standalone examples.

## Workspace packages

| Directory | Internal import | Responsibility |
| --- | --- | --- |
| `packages/core` | `@smolter/core` | Route matching, requests, state, and public data types |
| `packages/react` | `@smolter/react` | React context, hooks, forms, links, and route views |
| `packages/preact` | `@smolter/preact` | Preact context, hooks, forms, links, and route views |
| `packages/client` | `@smolter/client` | Browser transport for server loaders and actions |
| `packages/server` | `@smolter/server` | Request dispatch, SSR loading, and hydration serialization |
| `packages/files` | `@smolter/files` | Flat route discovery |
| `packages/vite` | `@smolter/vite` | Route module generation and development transport |
| `packages/ui` | `@smolter/ui` | Shared example UI |
| `packages/smolter` | `@kasperrt/smolter/react`, `@kasperrt/smolter/preact`, etc. | Published package and public entry points |

Implementation packages are private workspace packages. Keep changes in their
`src` directories. The publish build assembles portable source modules under
`packages/smolter/src/internal` and emits JavaScript and declarations into `dist`.
Both directories are generated. The published package has no workspace or runtime
dependencies, and consumers continue to choose `@kasperrt/smolter/react` or `@kasperrt/smolter/preact`.

Examples use the public imports to exercise the same API consumers install.
Their workspace names are `@smolter/example-react`, `@smolter/example-preact`,
`@smolter/example-react-ssr`, and `@smolter/example-preact-ssr`.

## Rendering and compiler

The React SPA and SSR examples enable React Compiler through Vite's native
compiler option. It runs only on React application source; Preact is independent.
Compiler tooling is development-only. The native compiler integration is marked
experimental by Vite; browser and production smoke tests cover both React examples.

The router adapters use `useSyncExternalStore`. Loader, action, and location hooks
select their own values, so unrelated state notifications do not force their
consumers to rerender. Browser tests assert this for both frameworks.

The two adapter effects manage browser lifecycle and fetcher cancellation.
They do not mirror router state into component state. Keep cleanup intact when
changing subscriptions, including unmounts and server hydration.

## Validation

- `pnpm fix` and `pnpm typecheck` check formatting and types.
- `pnpm coverage` requires 100% line coverage per implementation file.
- `pnpm smoke` exercises the four running examples in Chromium.
- `pnpm build:examples` and `pnpm smoke:production` test production SSR.
- `pnpm pack:smoke` installs the tarball into isolated React and Preact projects.
- `pnpm jsr:check` checks the portable source package and public API types.
- `pnpm size` measures all browser exports and updates the website's size data.

The browser bundle must remain below 2,100 bytes gzip. Moving code between files
or packages does not exempt it from measurement. Preserve tree shaking and avoid
adding runtime abstractions just to share source code between frameworks.
