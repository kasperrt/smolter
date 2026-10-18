import { execFileSync, spawnSync } from "node:child_process";
import { expect, it } from "vitest";

for (const version of ["0.0.1-rc.1", "0.4.5-beta.1", "0.0.1"]) {
  for (const scenario of ["new", "existing", "published", "delayed"]) {
    it(`uses only OIDC for a ${scenario} npm package at ${version}`, () => {
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
            RELEASE_TEST_VERSION: version,
            SMOLTER_NPM_BOOTSTRAP_TOKEN: "test-only-bootstrap",
            NODE_AUTH_TOKEN: "test-only-legacy",
          },
          stdio: "pipe",
        },
      );
    });
  }
}

for (const scenario of [
  "bootstrap",
  "partial",
  "retry",
  "merged",
  "unindexed",
  "unmerged",
  "wrong-sha",
  "wrong-base",
  "wrong-repo",
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
      [
        "released",
        "registry-error",
        "stale",
        "unmerged",
        "wrong-sha",
        "wrong-base",
        "wrong-repo",
      ].includes(scenario)
        ? 1
        : 0,
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

for (const scenario of [
  "jsr-rejected",
  "jsr-missing",
  "jsr-unavailable",
  "jsr-delayed",
]) {
  it(`gates npm on JSR for ${scenario}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/release-preload.mjs",
        "scripts/release.mjs",
        "publish",
      ],
      {
        env: { GITHUB_ACTIONS: "true", RELEASE_TEST_SCENARIO: scenario },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(scenario === "jsr-delayed" ? 0 : 1);
    if (scenario === "jsr-rejected")
      expect(result.stderr).toContain("JSR rejected publication");
    if (scenario === "jsr-missing")
      expect(result.stderr).toContain("npm publication is blocked");
    if (scenario === "jsr-unavailable")
      expect(result.stderr).toContain("Registry check failed: 503");
  });
}

for (const mode of ["publish-jsr", "publish-npm"]) {
  it(`runs the isolated ${mode} workflow step`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/release-preload.mjs",
        "scripts/release.mjs",
        mode,
      ],
      {
        env: { GITHUB_ACTIONS: "true", RELEASE_TEST_SCENARIO: "new" },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
  });
}

for (const scenario of ["jsr-rejected", "jsr-missing", "jsr-unavailable"]) {
  it(`publishes npm independently of ${scenario}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tests/fixtures/release-preload.mjs",
        "scripts/release.mjs",
        "publish-npm",
      ],
      {
        env: { GITHUB_ACTIONS: "true", RELEASE_TEST_SCENARIO: scenario },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
  });
}
