# Releasing Smolter

GitHub Actions publishes after CI succeeds on the current `main` commit.
Beta releases go directly to main after local validation, avoiding duplicate PR CI.
Stable releases require a merged PR. Local publication and tag pushes are not release paths.

## Validate

- Keep `package.json` and `jsr.json` versions equal.
- Run formatting, typechecking, unit/browser tests, packed consumers, production SSR, JSR validation and size checks.
- Maintain 100% line coverage per runtime/tooling file.
- Update the changelog, affected guides and measured size tables.
- Preserve npm `latest` during a beta release; beta versions use `beta`.

For a beta, commit the validated changes and push directly to main. For a stable release, merge the validated PR. Main CI gates both publication and Pages deployment.

## Publish and verify

npm uses GitHub OIDC trusted publishing for owner `kasperrt`, repository `smolter`, workflow `release.yml` and environment `release`. Publishing tokens are ignored. Never print credentials.

JSR validation remains in CI. JSR publication and registry queues do not block npm publication.

An accepted upload may still be processing. Verify the npm version endpoint, download the tarball and check its integrity, then verify the distribution tag and GitHub release. Do not repeatedly upload while registry processing is pending. Once the version is visible, rerunning the failed release job skips publication and completes finalization.

The release verifier rejects stale main commits. Stable releases also require a matching merged PR, with the existing initial-release retry exception. Beta releases do not require a PR.

## Version changes

`pnpm version:patch` and `pnpm version:minor` update both manifests. For a beta, set the same explicit prerelease version in both files. `pnpm version:release` removes an existing prerelease suffix. These commands do not publish; publication follows successful main CI.
