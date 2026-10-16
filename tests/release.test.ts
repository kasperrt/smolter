import { execFileSync } from "node:child_process";
import { it } from "vitest";

for (const scenario of ["new", "existing", "published"]) {
  it(`uses the correct publishing credentials for a ${scenario} npm package`, () => {
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
