# Releasing smolter

Releases are made by GitHub Actions after a pull request merges into `main`.
Local publishing, tag pushes, and manual workflow dispatch are not release paths.

## Release requirements

- npm and JSR manifests contain the same version.
- Formatting, types, unit tests, package smoke tests, browser tests, production
  SSR tests, JSR validation, and the size gate pass for the merged commit.
- The commit is the merge commit of a pull request targeting `main`.
- The repository is public and the GitHub Pages build passes.

The first candidate is **0.0.1-rc.1**, published with the npm `next` tag and
marked as a GitHub prerelease. Stable versions use npm `latest`.
The release goal also requires npm and JSR availability and a verified public site.

## Registry setup

The npm package is `smolter`; the JSR package is `@kasperrt/smolter`.

Configure npm trusted publishing for GitHub owner `kasperrt`, repository
`smolter`, workflow `release.yml`, and environment `release`. Allow publishing.
Publishing uses OIDC only. No npm access token is used or stored in GitHub.

Create the JSR package and link it to `kasperrt/smolter` in its settings.
GitHub Actions uses OIDC to publish with provenance; no JSR token is needed.

## Subsequent releases

1. Run `pnpm version:patch` or `pnpm version:minor` to update both manifests.
2. Update the changelog and examples for the new version.
3. Open a pull request and let all required checks finish.
4. Merge the PR. The release workflow publishes missing registry versions,
   then creates the GitHub release and version tag.

A registry failure can be retried by rerunning the failed workflow. The release
checks registry responses explicitly; a network or authorization error is not
interpreted as an unpublished version.
