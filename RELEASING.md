# Releasing smolter

Releases are made by GitHub Actions after CI succeeds on `main`.
Direct commits are allowed until 0.0.1 is published to both npm and JSR.
After that, changes must go through pull requests.
Local publishing, tag pushes, and manual workflow dispatch are not release paths.

## Release requirements

- npm and JSR manifests contain the same version.
- Formatting, types, unit tests, package smoke tests, browser tests, production
  SSR tests, JSR validation, and the size gate pass for the release commit.
- The required `coverage` check reports 100% line coverage for every file in
  the core, React, Preact, client, server, files, and Vite workspace packages, combining unit tests with real Chromium adapter tests.
- The commit is the current `main` commit. After 0.0.1 exists on both registries,
  it must be a PR merge, except retries of the original 0.0.1 release commit.
- The repository is public and the GitHub Pages build passes.

The first candidate is **0.0.1-rc.1**, published with the npm `next` tag and
marked as a GitHub prerelease. Stable versions use npm `latest`.
The release goal also requires npm and JSR availability and a verified public site.

## Enable workflows after local validation

CI, Pages, and Release are disabled during bootstrap work. Once the local
release checks above pass, including the size limit, re-enable them:

```sh
gh workflow enable ci.yml
gh workflow enable pages.yml
gh workflow enable release.yml
```

The next push to `main` starts CI; Pages and Release wait for its success.

## Registry setup

Both npm and JSR publish `@kasperrt/smolter`. All consumer
imports use the full scope, including `@kasperrt/smolter/react`.

Configure npm trusted publishing for GitHub owner `kasperrt`, repository
`smolter`, workflow `release.yml`, and environment `release`. Allow publishing.
The one-time bootstrap upload has registered the npm package. The workflow now
uses OIDC only and ignores publishing tokens. The GitHub bootstrap secret has
been removed; revoke its original token in npm after configuring the publisher.
A successful upload is not sufficient: both registry versions must be available
before the workflow creates a GitHub release.

Create the JSR package and link it to `kasperrt/smolter` in its settings.
GitHub Actions uses OIDC to publish with provenance; no JSR token is needed.

## Promote the release candidate

Run `pnpm version:release` to change both manifests from `0.0.1-rc.1` to
`0.0.1`. This only edits the manifests; publication still runs through Actions
after all release checks pass. The command rejects mismatched registry versions
and refuses to promote a version that is already stable.

## Subsequent releases

1. Run `pnpm version:patch` or `pnpm version:minor` to update both manifests.
2. Update the changelog and examples for the new version.
3. Open a pull request and let all required checks finish.
4. Merge the PR. The release workflow publishes missing registry versions,
   then creates the GitHub release and version tag.

A registry failure can be retried by rerunning the failed workflow. The release
checks registry responses explicitly; a network or authorization error is not
interpreted as an unpublished version.

After 0.0.1 is available on both registries, restore required PRs and the
`checks (22)`, `checks (24)`, `browser`, `jsr`, `site`, and `coverage` status checks
on `main`. Coverage remains 100% per file; each browser adapter must remain smaller than its
corresponding pinned wouter entry under identical gzip measurements.

Restore branch protection with the checked-in policy:

```sh
gh api --method PUT repos/kasperrt/smolter/branches/main/protection \
  --input .github/main-protection.json
```

## Published size badges

The release workflow adds BundleJS badges to the registry README immediately
before publishing its artifact. Each badge measures all exports of the published
React or Preact entry, pins the released version, and excludes the framework.

After both registries confirm the version, run `pnpm docs:badges` and commit the
README updates to GitHub. This command refuses to expose badges before both
versions exist. Each badge links to its reproducible BundleJS configuration.
BundleJS uses its own bundler settings; its displayed size is independent of our
local CI measurement. The local size gate remains authoritative for releases.

## Stalled registry publications

The release job has a 10-minute ceiling. Each registry publishing step has a
3-minute ceiling; JSR must succeed before npm can start. A stalled or queued JSR
upload fails the workflow at that deadline instead of holding a runner for hours.
Registry availability requests time out after 15 seconds. Availability retries
are limited to four checks with five-second waits, not an indefinite loop.

Cancel a stuck run with `gh run cancel RUN_ID`. Cancellation stops the Actions
runner, but does not cancel a publication already queued inside JSR. Check the
package's JSR Versions page before retrying. Do not repeatedly rerun while that
publication remains queued, and do not bypass JSR to publish npm.

Once the queued version is available, rerun the release workflow. Already
published versions are skipped, so it can proceed to npm without reuploading JSR.
The release commit must still be current main; otherwise use the release workflow
for the newer validated main commit. There are no scheduled publication retries.
Timeout changes apply to new workflow runs, not an already running job.
