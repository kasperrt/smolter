import { execFileSync, spawnSync } from "node:child_process";
import { expect, it } from "vitest";

for (const scenario of ["new", "existing", "published", "delayed"]) {
  it(`uses only OIDC for a ${scenario} npm package`, () => {
    execFileSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/release-preload.mjs",
        "scripts/release.mjs",
        "publish",
      ],
      {
        env: {
          GITHUB_ACTIONS: "true",
          RELEASE_TEST_SCENARIO: scenario,
          SMOLTER_NPM_BOOTSTRAP_TOKEN: "test-only-bootstrap",
          NODE_AUTH_TOKEN: "test-only-legacy",
        },
        stdio: "pipe",
      },
    );
  });
}

for (const scenario of [
  "bootstrap",
  "partial",
  "retry",
  "merged",
  "released",
  "registry-error",
  "stale",
]) {
  it(`enforces the ${scenario} release policy`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/release-verify-preload.mjs",
        "scripts/release.mjs",
        "verify",
      ],
      {
        env: {
          GITHUB_ACTIONS: "true",
          RELEASE_SHA: "current-sha",
          RELEASE_TEST_SCENARIO: scenario,
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(
      ["released", "registry-error", "stale"].includes(scenario) ? 1 : 0,
    );
  });
}

it("does not report a staged npm upload as a released version", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./tests/fixtures/release-preload.mjs",
      "scripts/release.mjs",
      "publish",
    ],
    {
      env: { GITHUB_ACTIONS: "true", RELEASE_TEST_SCENARIO: "staged" },
      encoding: "utf8",
    },
  );

  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "A staged npm upload is not a released version",
  );
});
