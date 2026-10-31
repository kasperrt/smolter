# Changelog

## 0.4.11

- Update the documentation site, examples and development validation to Preact 11.1.1 and preact-render-to-string 6.8.2. Update JSR dependency imports to the same versions.
- Validate packed consumers against both the existing minimum Preact 11.0.1 / renderer 6.8.1 and the new versions. npm peer minimums and public APIs remain unchanged; npm consumers select their Preact versions independently.

## 0.4.10

- Inspect directly imported JSX links before expensive prefetch type inference. When those links already require every capability, skip the remaining expression analysis; otherwise retain the complete alias, wrapper and dynamic-spread checks. Continue watching all source dependencies for HMR. This build-only optimization changes no public API or browser runtime.
- Avoid parsing documentation-only TypeScript comments and enumerating discarded tsconfig include lists during prefetch analysis. Preserve JavaScript JSDoc types, inherited compiler options, the complete type graph and watched dependencies. Add regressions for JSDoc imports and dynamically supplied Link components.

## 0.4.9

- Reduce prefetch capability analysis work during Vite builds. Reject irrelevant syntax before requesting TypeScript types and stop semantic traversal once every capability must be retained, while continuing to track source dependencies for HMR. Preserve aliased components, typed spreads and conservative handling of dynamic usage.
- Add React/Preact regressions for resolved aliases, re-exports, typed wrappers and later watched dependencies, plus development capability updates when source files are added or removed. Public APIs, browser bundles and application configuration are unchanged.

## 0.4.8

- Reduce duplicated prefetch, submission and adapter bookkeeping while preserving cancellation, consume-once reads, mutation invalidation and React/Preact behavior. Keep excluded prefetch capabilities removable from browser builds.
- Share scroll history with the existing navigation store and avoid route-component lookups when view transitions are disabled or unavailable. Retain Preact root updates required for streamed Suspense cleanup.
- Let previously created fetchers notify the currently installed deployment watcher when submissions finish. A replaced watcher can recover its eligible destination after protected work settles; stale cleanup cannot discard the new watcher.
- Preserve externally managed React document classes across subsequent application renders. Keep hydration, input state, root errors and deferred promise values covered by regressions.
- Start guarded mutation work in call order so an earlier page action cannot redirect over newer navigation. Preserve cancellation before speculative loader execution.
- Release redirecting fetchers from submission state when destination loading or root refresh rejects, then surface the original failure without replaying the mutation.
- Preserve error-element attributes, including alert roles, ARIA metadata and styles, when Preact resumes a rejected streamed Suspense boundary. Mount the replacement error UI before paint while retaining the surrounding shell and input state.

## 0.4.7

- Cancel unread response bodies when the Node destination has already closed or ended, preventing ERR_STREAM_UNABLE_TO_PIPE after a client disconnects during rendering.
- Treat clean downstream disconnects during streaming as cancellation while preserving genuine renderer, source, destination and body-cancellation failures for error handling. Abort Web Request signals even when the destination closed before request conversion.
- Check the newest available releases of Node 22, 24 and 26 with stable major-version job names. Coverage, browser, documentation and publication jobs use the newest Node 26 release without a patch-version pin; consumer runtime requirements are unchanged.
- Add gated HTTP disconnect/error regressions and deterministic nested-stream ownership tests. Document the Node adapter cancellation contract. Browser bundle sizes are unchanged.

## 0.4.6

[Validation and matched bundle sizes](reports/0.4.6.md).

- Preserve nested clientLoader promises in React and Preact applications instead of resolving them before committing navigation. Top-level required work still blocks; optional data renders through Await or use/Suspense. Promise identity is retained for revalidation, fetchers and prefetch reuse.
- Observe deferred rejections without replacing promises so abandoned or speculative values do not create unhandled rejections; mounted boundaries still receive the original failure.
- Transfer consumed prefetch cancellation to its navigation, allowing signal-aware optional requests to abort when their owner leaves.
- Keep server JSON transport, action-result normalization and the 8-second SSR hydration deadline unchanged. Client-created promises have no automatic Smolter deadline.
- Document deferred loader rendering, rejection, cancellation and cache behavior; add production-built React/Preact acceptance tests.

## 0.4.5

**Compatibility: initial deferred data now has an 8-second total budget, reduced from 30 seconds.** This applies to React and Preact hydration. If initial data intentionally takes longer, pass `mountApplication(routes, root, { deferredTimeout: 30_000 })` (or another explicit budget). Settlements do not restart the deadline. This bounds silent stream interruptions; it is not immediate disconnect detection or a performance improvement.

This release promotes the tested 0.4.5-beta.7 implementation without runtime or dependency changes.

- Add viewport and loader-data prefetching to both adapters through `prefetch="viewport"` and `prefetchData`. Smolter’s Vite plugin omits unused intent, viewport and data capabilities, retaining possible capabilities for dynamic spreads. Bounded speculative reads are invalidated by mutations, revalidation and disposal.
- Use route-local `.__smolter` data URLs by default while retaining explicitly configured scoped endpoints. Generate granular route/dependency fingerprints and support an explicit compatibility key for independently changed server contracts.
- Keep routine deployment checks off the navigation and history critical path. Recover missing action-redirect chunks after protected work finishes, without mutation replay or duplicate root refresh. Retain the usable view during successful built-in recovery and show genuine failures when recovery is unavailable.
- Support TypeScript 7 consumers with Smolter-owned stable compiler-API tooling that stays out of browser bundles. Improve lazy-import retry, submission cleanup and bounded route-pattern reuse.
- Prevent abandoned Preact streamed content and nested errors from appearing after navigation. Preserve boundary structure, shared components, root controls and Await identity during revalidation.
- Update guides, API reference and matched bundle measurements. Consumer validation reported both streaming reproductions fixed and recovery intact; this is not blanket browser/device, offline or CDN sign-off. See the [streaming report](https://github.com/kasperrt/smolter/blob/main/reports/0.4.5-beta.7.md) for reproduction details and raw/gzip/Brotli sizes.

## 0.4.5-beta.7

- Prevent late Preact Suspense islands from restoring abandoned route content. Claim stream targets within inert outlet anchors during hydration while retaining Preact’s boundary structure, then remove abandoned markers on component changes, including later nested markers. Preserve shared components and persistent root boundaries.
- Keep Await component identity stable when a pending promise becomes resolved data, including root revalidation during streaming.
- Reduce the default initial deferred-data deadline from 30 seconds to 8 seconds so silent document interruptions reach failure UI within a bounded interval. Longer explicit deferredTimeout budgets remain supported; this is timeout handling, not immediate transport failure detection.
- Add production regressions for outer Suspense, delayed island animation frames, root revalidation, and default-budget response destruction. See the [reproduction and size report](https://github.com/kasperrt/smolter/blob/main/reports/0.4.5-beta.7.md).

## 0.4.5-beta.6

- Replace promise chains with guarded async/await across runtime, tooling and fixtures while preserving rejected responses, deferred errors and cleanup. Enforce async syntax, explicit types and contiguous blocks during lint.
- Release speculative-read mutation protection even when a submission throws synchronously.
- Render Preact application document content when the optional root module is absent, matching React. Remove redundant internal Preact hydration/root-data forwarding modules.
- Reuse up to 256 parsed route patterns without caching modules, params or loader results. Preserve first-match ordering and changed route paths. Repeated navigation is faster in matched local API benchmarks; first-seen pattern churn pays cache insertion overhead.
- Consolidate speculative-read settlement bookkeeping and retain lazy-route retry cleanup across both import and module-preparation failures.

- Consolidate response normalization and deferred settlement branches without changing supported results or rejection handling. See [audit and matched measurements](https://github.com/kasperrt/smolter/blob/main/reports/0.4.5-beta.6.md) for all five audit and eight optimization passes, byte deltas and timing limitations.

## 0.4.5-beta.5

- Keep the previous usable React/Preact application view while a failed chunk is being checked for deployment recovery. Successful document recovery no longer briefly commits the route error boundary.
- Release genuine errors when confirmation fails, the manifest is unchanged, recovery is unavailable or a custom reload callback returns. Preserve submission ownership and redirect recovery without delaying ordinary navigation.
- Allow locally validated beta releases directly from current main, retaining main CI and stable-release PR requirements.

## 0.4.5-beta.4

- Recover a missing action-redirect destination chunk after tracked submissions and root revalidation finish. Keep the original destination, query and hash without replaying the mutation or refreshing root data twice.
- Invalidate queued recovery when newer navigation, history, mutation or watcher cleanup supersedes it. Other pending tracked fetchers continue to prevent document recovery.
- Add rejected-promise and production missing-chunk regressions with fast and delayed manifest responses. Ordinary navigation remains nonblocking.

## 0.4.5-beta.3

- Publish npm independently of JSR registry queues, retaining JSR validation in CI and npm prerelease/provenance checks.

- Keep deployment manifest requests off the navigation and Back/Forward critical path. Routine checks run in the background; confirmed changes apply on the next eligible navigation, without reloading a successfully rendered page when a late response arrives.
- Reuse completed routine checks, including failed checks, for 30 seconds by default. Missing-chunk recovery bypasses the interval and refreshes an older in-flight result when necessary; concurrent recovery callers share the fresh request.
- Use safeWrapAsync for deployment cleanup and submission failure propagation; remove promise chains and catch/finally paths from the deployment fixture and runtime.
- Preserve destination fingerprints, query/hash/base paths, mutation protection and one-reload safeguards. Add production coverage for a held manifest request, persistent input and subsequent deployment recovery.

## 0.4.5-beta.2

- Fix Vite production builds in TypeScript 7 consumers by declaring the compiler API used for prefetch analysis as Smolter's own pinned, separately named `typescript-compiler` build-time dependency instead of an unconstrained consumer peer. Application TypeScript versions remain independent; no compiler enters browser output.
- Upgrade Smolter compilation and typechecking to TypeScript 7.0.2. Analysis and documentation tooling use the stable TypeScript 6 compiler API; no experimental TypeScript APIs are used.
- Add packed-package React 18/19 and Preact consumer builds with TypeScript 7.0.2, checking browser/SSR output, disabled prefetch, viewport/data selection, and conservative union spreads.
- Clarify compiler ownership in the README and prefetch guides. Browser implementations and size budgets are unchanged.

## 0.4.5-beta.1

- Use route-local `.__smolter` data URLs by default, with shared dev/production validation and explicit legacy endpoint compatibility.
- Generate deterministic deployment identities and dependency fingerprints for lazy file routes; avoid unrelated-route reloads, cache routine checks briefly, and force fresh missing-chunk recovery. Server-only contract changes support an explicit compatibility key.


- Infer intent, viewport and data prefetch capabilities in the Vite plugin from typed JSX and spreads. Keep the string-based Link API identical in React and Preact; omit unused implementations without capability imports. Unions and opaque inputs retain all possible capabilities. Refresh client and SSR capability selection during development. TypeScript is an optional build-only peer required by the Vite plugin.
- Select supported browser exports in generated lazy file-route imports so unrelated exports can be removed without disabling CSS or module side effects.
- Publish this prerelease under npm `beta`, never `latest`; JSR remains the first publication gate.
- Add opt-in viewport code/data prefetching to React and Preact links. Reuse bounded, router-local speculative loader results on navigation; invalidate on mutations, revalidation and disposal. Keep existing links intent/code-only by default.

## 0.4.4

- Remove the separate `/react/data` resource router. Both main adapters provide route data, forms, submissions and independent fetchers through `createDataRouter`; migrate ResourceProvider/Resource hooks to RouterProvider and the main data hooks. The old pathless resource store and tuple fetcher API are removed, not aliased to incompatible signatures.

- Complete React routing-hook parity: navigation/submission state, URL/search/history helpers, route errors, root data and route-ID data. Add React RouterApplication and match Preact loader/fetcher type inference.
- Support React application SSR and hydration, document helpers, lazy routes and application Vite middleware. React DOM 19+ powers integrated documents; routing hooks and manual loadRouter SSR retain React 18 support. Share transport, root revalidation, hash history, hydration payloads and server orchestration across renderers.
- Export renderer-independent dispatchRoute from both server entries. Preserve scoped endpoints, private caching, redirects, cancellation and mutation ownership.
- Add React link intent prefetching, structured/GET fetcher submissions and real NavLink pending state in both adapters. Report pending destinations under plain providers as well as retained application views.
- Update compatibility badges, guides, package-isolation checks and bundle tables. Verify React production early hydration, persistent input, root refresh, CSP and abandoned deferred boundaries.

## 0.4.3

- Prefetch individual guide articles on pointer, keyboard and touch intent. Keep the shared header, sidebar and current article visible during cold guide navigation; show a quiet pending status without replacing the layout. Link the header directly to the canonical Getting started guide.
- Publish compact React/Preact and SSR compatibility indicators in guide navigation and detailed support information on each page.
- Document every public JSR entrypoint and exported symbol. Validate the generated documentation before publishing, preserving JSR-before-npm release ordering.

- Add React `Outlet`, `useMatches` and `useOutletContext`; allow Preact matches under a plain RouterProvider. Show renderer and SSR compatibility in documentation navigation and on each page. Integrated document/early-hydration APIs remain Preact-only.

- Remove the public `safeWrapAsync` utility; retain it internally for router and server error handling. Existing consumers of this export must provide their own error handling. `useMatches` and `useOutletContext` remain public Preact APIs.

## 0.4.2

- Add integrated `Await fallback` for early hydration: pending and resolved content belongs to the mounted component, so navigation, root revalidation and late settlement cannot leave abandoned content behind. Migrate early-hydrated deferred sections from outer Preact `Suspense` to this prop, including root sections. Native Preact streamed Suspense remains unsupported for this ownership contract; it is not patched. Ordinary non-early SSR still streams resolved HTML.
- Preserve deployment recovery ownership across overlapping page/fetcher submissions and watcher replacement, including old cleanup calls. Mutations are not replayed and pending submissions continue to prevent recovery reloads.
- Bound initial deferred-data hydration with one total deadline (30 seconds by default); validate integer millisecond budgets, reject outstanding promises on expiry and clear lifecycle state on disposal. This is not an inactivity timer or an immediate network-disconnect detector.
- Support literal dots in flat route filenames and folders: `robots[.]txt` maps to `/robots.txt`. Generated file routes reject `id` and `routePath` overrides; derive identity from their filename and use their path for targeted revalidation. Manually defined route arrays retain explicit identities.
- Keep the thirteen-case ownership matrix, streaming/CSP/head-preservation checks, scoped transports, deployment recovery and route HMR as production regression gates. Preserve the native Preact diagnostic separately; passing Smolter tests do not claim native Preact or Vibes/device parity.

## 0.4.1

- Invalidate pending deployment recovery when an independent fetcher submits. Prevent recovery reloads while any tracked fetcher submission is pending, without blocking ordinary client navigation. Install the watcher before creating fetchers; mountApplication already does this.
- Add regressions for two fetcher mutations completing before an older manifest check, overlapping pending submissions, unused recovery markers, later recovery, and watcher cleanup. These deterministic tests do not establish the complete streaming/offline browser matrix.
- Clarify that root stylesheet URL imports rely on rendered stylesheet links and are outside route CSS discovery. Empty route styles arrays are expected in that setup; explicit host preload hints should be justified by measurements.

## 0.4.0

- Add opt-in `earlyHydration: true` to Preact `renderApplication`: hydrate the shell before optional nested loader promises settle, using Preact Suspense and independently streamed values/errors. Default hydration timing is unchanged.
- Preserve shared promise identity, nonce-aware script serialization and the renderer's streaming container. Reject unfinished values when the document stream ends or the router is disposed; cancel server readers on disconnect.
- Add production regressions for interaction and input retention during a 1,500 ms delay, independent deferred boundaries, rejection, one-time mutation, navigation before settlement, injected head nodes and CSP nonces. These are fixture results, not Vibes performance or device sign-off.
- Include matched-route CSS in generated asset manifests and stylesheet preload hints using Vite’s anonymous CORS mode. Verify cross-origin preload reuse in Chromium. Keep transitive JavaScript dependencies discoverable and optional dynamic imports lazy. Preload hints do not apply styles or imply a measured latency improvement.
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
