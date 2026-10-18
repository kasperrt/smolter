# Smolter development rules

Read `.agents/skills/smolter/SKILL.md` in full before changing or reviewing this repository. Apply these rules together with the user's global instructions and current task constraints.

## Code conventions

- No `try`, `catch`, or `finally` blocks, and no `.then()`, `.catch()`, or `.finally()` chains. Use `async`/`await` with the existing internal `safeWrapAsync` from `@smolter/core` for fallible work. Handle its `{ data, error }` result directly; do not invent tuple adapters or duplicate wrappers.
- No empty lines inserted for breathing room between related statements, declarations, guards, state updates, awaits, cleanup or returns inside a function/block. Keep the flow contiguous. Blank lines may separate imports from top-level declarations or independent top-level definitions; they are not a substitute for structure.
- No `any`, `@ts-ignore`, `@ts-nocheck`, or broad lint/coverage exclusions. Fix types and ownership rather than suppressing errors.
- Use Biome with this repository's double quotes and two-space indentation. Do not import another repository's formatter settings or introduce ESLint.
- Keep helper outcomes to data/error rather than positional tuples with three or more values. Domain payloads and existing public router interfaces retain their required fields and methods.
- Import other workspace packages through their `@smolter/*` aliases and declared exports, never relative paths into another package's source. Public examples and packed consumers use `@kasperrt/smolter/*` exports.
- Put renderer-independent behavior in existing shared packages. React and Preact must expose equivalent routing capabilities. Keep browser, server and Vite tooling boundaries intact.
- Do not add forwarding packages, consumer-specific route names, redundant wrappers, speculative abstractions, unused exports or duplicate routers. Keep constants with their owning feature or in a constants module, not loose application-root files.
- Use current stable dependencies and APIs. No experimental compiler/runtime APIs without explicit user authorization. Build-only dependencies must not enter browser output.

## Validation and release

- Before committing, run `pnpm lint`, `pnpm typecheck`, and tests appropriate to the changed behavior. For runtime changes, verify coverage, packed consumers, production-browser behavior and sizes. Keep the existing coverage and size gates.
- Inspect the diff for prohibited async syntax and padding inside code blocks; Biome alone does not enforce every rule above.
- Update affected guides, generated API references, size tables and changelog. Distinguish reproducible evidence from assumptions and untested consumer behavior.
- Preserve the established PR/CI process, JSR validation in CI and independent npm publication, and prerelease tags. A beta release must not move npm `latest`. Verify actual registry availability and package integrity; an accepted or queued upload is not a completed release.
- Stop temporary servers and browser sessions started for the task. Preserve existing user development processes and unrelated changes.

## Infrastructure and publication safety

- Never apply infrastructure changes, access production Kubernetes clusters or access production databases.
- Never request or display secrets. Use configured credentials without reading their values; ask the user to provision missing credentials securely.
- Do not open pull requests in repositories the user neither owns nor contributes to without explicit permission. Work in this repository does not authorize publishing fixes to dependencies or changing consumer repositories.
