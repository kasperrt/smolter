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
Both directories are generated. The published package has no workspace dependencies;
its TypeScript dependency is build tooling. Consumers continue to choose `@kasperrt/smolter/react` or `@kasperrt/smolter/preact`.

Examples use the public imports to exercise the same API consumers install.
Their workspace names are `@smolter/example-react`, `@smolter/example-preact`,
`@smolter/example-react-ssr`, and `@smolter/example-preact-ssr`.

External dependencies use exact versions from the `pnpm-workspace.yaml` catalog.
Public peer declarations describe compatibility. Size tooling lives under
`apps/preact/benchmarks` and runs for hosted docs; competitor sizes are versioned
reference measurements, without installing the competitor packages.

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

Package tests live under `packages/*/tests`; cross-package suites and shared fixtures live in `packages/integration-tests/tests`. Framework development dependencies belong to their owning packages and apps, not the publishing root.

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

## Security scans

CI runs `audit` and `semgrep` once on every pull request and main push. Their
failure fails CI, so the release workflow cannot publish from a failed scan.
Semgrep SARIF is uploaded to GitHub code scanning and retained as an artifact;
pnpm's JSON audit report is retained separately. Both jobs have ten-minute limits.

Run the same checks locally from the repository root:

```sh
pnpm audit --audit-level=low --json
python3 -m venv /tmp/smolter-security-tools
/tmp/smolter-security-tools/bin/pip install -r .github/semgrep-requirements.txt
/tmp/smolter-security-tools/bin/semgrep scan --config p/ci --config p/javascript --metrics=off --disable-version-check --error --strict .
```

Audit covers the whole workspace, including development and optional dependencies.
Do not ignore registry errors or unfixable advisories to make CI green. Semgrep is
pinned separately from npm dependencies, needs no account/token, and disables
metrics. Its maintained registry rules cover JavaScript/TypeScript and CI security;
rule updates may reveal new findings without a package change. No scanner enters
the published package or browser bundles.

`.semgrepignore` excludes generated artifacts and installed dependencies, not
source or test directories. Four exact-rule annotations document reviewed false
positives: JSON-LD uses `serializeData` (script escaping is browser-tested in both
adapters), and the example SSR entry accepts a Request rather than an Express
template path. Review these annotations whenever the associated code changes.
Do not add blanket rule exclusions or unaudited `nosemgrep` annotations.

GitHub Actions use full commit pins. pnpm enforces a seven-day minimum release age,
blocks exotic transitive sources, and prevents trust downgrades. The exact-version
age exceptions preserve the already validated lockfile; they do not exempt future
versions. New exceptions require explicit review. These checks supplement manual
security review and exploit regressions; a clean scan is not proof of safety.
