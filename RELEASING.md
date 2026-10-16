# Releasing

The package is currently private source and has not been published to a registry.

Keep the version at **0.0.1** during development. Only change it when preparing an actual release.

1. For a subsequent release, run `pnpm version:patch` or `pnpm version:minor` from the root. This updates
   the npm manifest and JSR manifest together. For a major release, edit both.
2. Update `CHANGELOG.md`, documentation, and the demo version label.
3. Run `pnpm fix`, `pnpm check`, `pnpm pack:smoke`, and `pnpm smoke`.
4. Review `pnpm --dir packages/smolter pack --pack-destination ../..`.
5. Commit the version, push, and wait for CI. Tag the release `vX.Y.Z`.
6. Publish manually when desired. Registry publication is not automatic in CI.

The unscoped npm name `smolter` is a candidate, not a reserved name. Verify access
or choose an owned scope before publication. No credentials are stored here.

## JSR preparation

`packages/smolter/jsr.json` exports typed source entrypoints for React, Preact,
the headless core, and server helpers. It pins npm imports for framework adapters.
Reserve `@kasperrt/smolter` and run `deno publish --dry-run` from that directory
with a current Deno installation before publishing. JSR availability, ownership,
and full publish validation are not established by the Node CI workflow. The
configuration is preparation, not a claim that the package is already on JSR.

React and Preact are optional peers on npm. Install only the framework used by
your selected adapter. No runtime dependencies should be added without an
explicit design decision and an updated size check.
