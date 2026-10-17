# Changelog

## 0.4.0

- Add opt-in `earlyHydration: true` to Preact `renderApplication`: hydrate the shell before optional nested loader promises settle, using Preact Suspense and independently streamed values/errors. Default hydration timing is unchanged.
- Preserve shared promise identity, nonce-aware script serialization and the renderer's streaming container. Reject unfinished values when the document stream ends or the router is disposed; cancel server readers on disconnect.
- Add production regressions for interaction and input retention during a 1,500 ms delay, independent deferred boundaries, rejection, one-time mutation, navigation before settlement, injected head nodes and CSP nonces. These are fixture results, not Vibes performance or device sign-off.
- Include matched-route CSS in generated asset manifests and stylesheet preload hints. Keep transitive JavaScript dependencies discoverable and optional dynamic imports lazy. Preload hints do not apply styles or imply a measured latency improvement.
- Update SSR and loading documentation, including removal of stale claims that the Express adapter buffers responses.

## 0.3.5

- Preserve explicitly unmanaged head elements marked data-smolter-preserve during Preact document hydration, without matching them to application-owned nodes.
- Test injected script/meta preservation, one-time script execution, styling and subsequent navigation.
- Add interaction-before/after-deferred-completion assertions and document that streaming does not provide progressive hydration.
- Fix route asset manifests incorrectly including external module specifiers as preload file URLs; retain transitive emitted chunks and leave optional dynamic imports lazy. No general request-count or latency improvement is claimed.

## 0.3.4

- Cancel stale deployment checks when newer Back/Forward operations return to the current route, including hash changes.
- Recover missing action-redirect chunks at the committed destination, preserving query/hash and avoiding mutation replay.
- Invalidate pending chunk recovery when a mutation starts; validate recovery ownership before claiming the reload marker.
- Expand production-browser coverage for scoped application paths, separate CDN asset/manifest origins, overlapping navigation, Chromium offline/online recovery and history races. Manual and file-route HMR remain covered.

## 0.3.3

- Ignore idle intent-prefetch chunk failures in deployment recovery so the next click retains its destination and reload marker.
- Keep active-navigation chunk recovery and latest-navigation wins behavior, with unit and production-browser regressions.

## 0.3.2

- Configure transport endpoints consistently across browser handlers, file routes, Express and development middleware for multiple apps sharing one origin.
- Refresh root data after action redirects, preserve redirect cookies and synchronize hash-history redirects.
- Recover missing initial route chunks when deployment metadata is passed to mountApplication.
- Stream Preact SSR with concurrent root/route loading, deferred data, root error boundaries and disconnect cleanup. Hydration begins after the document stream completes; requires preact-render-to-string >=6.8.1.
- Enforce private, no-store on route-data responses, including errors and mutations.
- Expose loader execution reason for explicit navigation/revalidation handling.
- Add regression coverage, production streaming browser tests and updated API documentation.

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
