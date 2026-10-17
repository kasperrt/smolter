# Changelog

## 0.3.1

- Refresh browser and SSR file-route discovery on additions, renames and removals; preserve normal Vite HMR for colocated helpers and components.

- Add optional production deployment manifests through `deploymentPlugin` for both React and Preact Vite integrations.
- Add `watchDeployment` to both client entrypoints: check before navigation and Back/Forward, recover stale Vite chunks after confirmed build changes, and preserve the requested URL.
- Skip hash-only links, development builds and SSR; bound failed checks and prevent repeated reloads. Keep routing-only bundles unchanged.
- Document production cache headers, CDN/application-specific manifest paths, unsaved state and rollout limitations.

## 0.3.0

### Migration from 0.2.0

- **Breaking:** use `createDataRouter` for loaders, actions, fetchers and revalidation. `createRouter` now creates a navigation-only router. Framework imports remain `@kasperrt/smolter/react` and `@kasperrt/smolter/preact`.
- **Breaking:** the Preact adapter requires Preact 11.0.1 or newer.
- Optional Preact application helpers use explicit `/preact/client`, `/preact/document`, `/preact/lazy-route` and `/preact/server` entry points. Server code and Vite tooling remain outside browser bundles.

### Added

- Navigation-only engines that tree-shake out data handling: 1,245 B React and 1,405 B Preact gzip with the documented routing subset.
- Preact application SSR and hydration, lazy flat routes, retained route content while loading, prefetching, and controlled view transitions.
- Express-compatible request/response helpers and documented Vite virtual-module and entry-file contracts.
- Route-targeted revalidation, including explicitly configured root data, and independent fetcher reads.
- Optional React resource hooks through `/react/data`.
- Detailed guides for routing, handlers, forms, fetchers, SSR, Express, bundle sizes and every public export.

### Fixed and improved

- Serialize Preact fetcher GET submissions into the destination query without navigating or invoking an action.
- Share form submission and navigation interception logic between adapters.
- Preserve cancellation, error hydration and stable data during navigation and revalidation.
- Separate example handler and boundary files; use route-appropriate loading placeholders.
- Build the publishable package and site through Vite with preserved module boundaries, production smoke tests and 100% implementation line coverage.
- Generate honest size comparisons for routing-only, data, transport and application entry points.

## 0.2.0

- Breaking: choose `@kasperrt/smolter/react` or `@kasperrt/smolter/preact` for routing APIs and types.
- Move optional transport, SSR, and build tools under the selected renderer’s `/client`, `/server`, and `/vite` subpaths. Remove root and top-level core/client/server/files/vite exports.
- Keep browser-safe helpers in `@kasperrt/smolter/utils`.
- Verify unused exports and server/build modules are removed from browser bundles.

## 0.0.1

- First stable release of `@kasperrt/smolter` for React and Preact.
- Typed loaders, actions, client handlers, fetchers, and controlled revalidation.
- Manual and flat file routes, server transport, SSR, and hydration.
- Tokenless npm and JSR publishing through tested GitHub Actions.

## 0.0.1-rc.2

- Use `@kasperrt/smolter` explicitly in every public import and generated route module.
- Remove the unscoped install alias from examples and documentation.

## 0.0.1-rc.1

- Typed React and Preact routing with loaders, actions, and independent fetchers.
- Server handlers with optional clientLoader and clientAction call-through.
- Manual route tables and optional flat file routing.
- Server rendering, hydration, and controlled loader revalidation.
- Four standalone examples and shared UI.
