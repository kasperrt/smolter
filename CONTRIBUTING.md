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
| Repository root | `@kasperrt/smolter/react`, `@kasperrt/smolter/preact`, etc. | Publishing manifest; exports map directly to owning packages |

Implementation packages are private workspace packages. Keep changes in their
`src` directories. The publish build assembles portable source modules under
the ignored `.generated/` directory and emits JavaScript and declarations into `dist`.
Both directories are generated. The published package has no workspace dependencies.
Its pinned TypeScript 7 compiler dependency uses the explicitly selected unstable native API only in Vite tooling; React and Preact
remain consumer-selected peers. The native compiler requires the platform binary installed by TypeScript’s optional dependencies. Consumers continue to choose `@kasperrt/smolter/react` or `@kasperrt/smolter/preact`.

Examples use the public imports to exercise the same API consumers install.
Their workspace names are `@smolter/example-react`, `@smolter/example-preact`,
`@smolter/example-react-ssr`, and `@smolter/example-preact-ssr`.

## Development dependency ownership

Pin external dependency versions in `pnpm-workspace.yaml` and use `catalog:`
from workspace manifests. Keep public peer compatibility ranges in the publishing
manifest. Put any necessary transitive security overrides in the workspace YAML
rather than scattering pins across packages.

Root development dependencies support the package build, repository-wide tests and
typechecking. Shared third-party versions are pinned once in the workspace catalog;
adapters declare their renderers as peers. React Compiler and its Vite plugin belong to the React examples.
`apps/preact/benchmarks` generates size data only for the hosted documentation.
The wouter, wouter-preact and React Router comparisons are recorded reference
measurements with versions, date and method in `packages/ui/src/comparison-sizes.json`.
These competitor packages are not installed. `pnpm size` measures Smolter and checks
its budgets against those reference values; `pnpm build:site` runs it before the
hosted build. Ordinary example builds do not run size tooling. Benchmark source
is outside the published package's file list; local installs and generated output
are ignored by Git.

The dependency-submission workflow resolves every workspace from `pnpm-lock.yaml`
and sends a snapshot to GitHub on dependency changes to main or manual dispatch.
It includes transitive and optional dependencies, preserves npm alias identities,
and distinguishes development dependencies from runtime dependencies. It installs
with lifecycle scripts disabled; its write permission is limited to the submission
job. GitHub can use this graph for Dependabot advisories even when manifests use
catalog references. `yaml` is development tooling for this snapshot; it is not a published runtime dependency.

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
- `pnpm size --breakdown` also measures the marginal gzip cost of each common export. These values include tree shaking and compression effects, so they do not add up to the bundle total. Both commands enforce the same size limits.

The routing-only subset must remain smaller than the corresponding wouter
routing subset under the same measurement settings. Full data and application
entries are measured and reported separately. Moving code between files or
packages does not exempt it from measurement. Preserve tree shaking and avoid
adding runtime abstractions just to share source code between frameworks.
