---
name: smolter
description: Implement, review, debug, document and release the Smolter TypeScript router, React/Preact adapters, SSR/client integration, Vite tooling and Preact documentation site. Apply repository-specific ownership, error-handling, formatting, package-boundary and validation rules.
---

# Smolter

Read the repository's `AGENTS.md` and the user's global instructions first. Current user instructions override copied conventions. This skill is specific to Smolter; it does not authorize changes or publication in a consumer or dependency repository.

## Locate the owner

- `packages/core`: shared routing, data and state logic without renderer dependencies.
- `packages/react` and `packages/preact`: renderer bindings with equivalent public capabilities. Use built-in renderer behavior where it satisfies the same contract; do not duplicate a framework implementation.
- `packages/client`: shared browser transport, hydration data and deployment recovery.
- `packages/server`: SSR, streaming and HTTP/Node integration. Keep Express middleware composition possible without coupling the router to an application server.
- `packages/files` and `packages/vite`: file-route discovery, build-time analysis, asset/deployment metadata and HMR.
- `packages/ui` and `examples`: the Preact documentation/demo site and production fixtures. Keep generic package behavior independent of demo data or consumer conventions.

Inspect nearby implementations, package exports and focused tests before editing. Extend existing modules rather than adding parallel application/router layers or re-export-only packages. Shared renderer behavior belongs in an existing shared location, not duplicated adapter code.

## TypeScript and errors

- Follow `AGENTS.md` for contiguous code: no blank-line padding between logical steps within a function or block.
- Use `async`/`await`, not promise chains. Guard fallible work with the existing `safeWrapAsync`; no try/catch/finally or `.then/.catch/.finally` chains.
- Smolter's helper accepts a function and returns `{ data, error }`. It does not use a consumer's tuple contract. Keep it internal and preserve errors where callers need to handle them.
- Do not wrap a result that is already normalized merely to change its shape. Do not create forwarding helpers or catch errors without an explicit failure policy.
- Cleanup must still run after guarded failures. Preserve cancellation, submission counters, error boundaries and rejection behavior; do not improve a size number by dropping them.
- Use explicit types, early returns and declared workspace aliases. No `any`, suppression directives or casts used to conceal incompatible contracts.
- Follow this repository's Biome configuration: double quotes and two spaces. Do not copy unrelated application formatting rules.


## Routing, SSR and recovery

- Infer file-route paths/IDs from filenames, including escaped literal dots. Do not require manual path/ID exports in file-router consumers. Keep manual route arrays supported.
- Keep resource and root-data mechanisms generic. Never hardcode a consumer's resource path. Transport must respect application prefixes, validation, cancellation and private/no-store data responses.
- Reuse initial SSR data, theme and asset URLs during hydration. Preserve the shell, inputs, focus and shared layout across navigation; do not mount a replacement loading screen over usable SSR HTML.
- Deferred content belongs to its current boundary. Abandoned fallback and resolved content must disappear; late settlement must not restore an old route or reset root state.
- Manifest checks must not block ordinary route work. Speculative failures must not reload or claim a recovery marker. Only the newest eligible navigation/history owner may recover; tracked mutations prevent recovery and must never be replayed.
- Preserve route fingerprints, scoped manifests, query/hash/base paths, CDN URL/CORS consistency, and bounded failure handling. No global polling, blanket preloading or broad DOM observers.
- Root stylesheet `?url` imports remain explicit stylesheet links. Do not treat them as inferred route CSS or restructure CSS merely to populate manifest metadata.
- Test both manual and file-route HMR when changing discovery/build behavior, including additions and removals. Conservative dynamic prefetch analysis must retain potentially used capabilities.

## Docs and presentation

- Use Preact for the documentation site. Keep useful, correctly styled SSR HTML and persistent navigation/header layouts. Split and prefetch guide articles without flashing or reloading the whole document.
- Keep guides concise, show accurate React/Preact and SSR support, and distinguish framework-provided APIs from Smolter exports. Document public changes on the actual guide surfaces, not only in a changelog.
- Use existing Tailwind conventions for static presentation. Preserve dark mode, accessible names, keyboard focus and stable loading/error layouts. Do not add an empty icon/forwarding package or custom CSS subsystem.
- Use named components with props defined above them and destructured in the signature, except required route/entry defaults. Use explicit conditional JSX branches and omit optional attributes rather than passing undefined.
- Keep public docs portable: use public repository identities rather than local checkout paths or private infrastructure details.

## Verify and ship

- Reproduce reported bugs before changing behavior; label fixture mistakes and unverified consumer scenarios honestly. Use controllable gates for races and assert absence of stale content, not only presence of the destination.
- Run lint/typechecking and focused tests, then required coverage, production-browser and packed-package checks. Maintain existing thresholds; no broad exclusions. Test both adapters when shared code changes.
- Measure sizes with a matched baseline, runtime, bundler, minifier and compression settings. Keep routing-only/data entrypoints free of optional SSR/recovery/tooling costs. Report raw/gzip/Brotli deltas where measured; distinguish total emitted assets from initial transfer.
- Measure successful interaction separately from TTFB, document completion and DOMContentLoaded. Do not claim better LCP or overall performance from smaller bundles alone.
- Update guides, API references, README size tables and changelog. Review the final diff for padding, promise chains, redundant wrappers and cross-package source imports.
- Follow the existing release workflow. Keep JSR validation in CI, but do not gate npm publication on JSR publication or its queue; prereleases use beta, not latest. Bound publication runners and observe accepted registry jobs without repeatedly paying for queued Actions runs. Verify npm availability, integrity and the release tag before reporting completion.
- Stop temporary processes/tabs and preserve unrelated work and existing development servers.
