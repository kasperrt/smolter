import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = resolve("scripts/dependency-snapshot.mjs");
const directories: string[] = [];
const environment = {
  ...process.env,
  GITHUB_SHA: "0123456789012345678901234567890123456789",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ID: "123",
  GITHUB_REPOSITORY: "kasperrt/smolter",
};
function snapshot(lock: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "smolter-dependencies-"));
  directories.push(directory);
  writeFileSync(join(directory, "pnpm-lock.yaml"), JSON.stringify(lock));
  return spawnSync(process.execPath, [script], {
    cwd: directory,
    env: environment,
    encoding: "utf8",
  });
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});
it("submits resolved aliases, peer variants and optional transitive dependencies", () => {
  const result = snapshot({
    lockfileVersion: "9.0",
    importers: {
      ".": {
        dependencies: {
          compiler: { specifier: "catalog:", version: "typescript@6.0.3" },
          internal: { specifier: "workspace:*", version: "link:packages/core" },
        },
        devDependencies: {
          "@scope/tool": {
            specifier: "catalog:",
            version: "2.0.0(peer@1.0.0)",
          },
        },
      },
    },
    packages: {
      "typescript@6.0.3": {},
      "@scope/tool@2.0.0": {},
      "shared@1.0.0": {},
    },
    snapshots: {
      "typescript@6.0.3": { optionalDependencies: { shared: "1.0.0" } },
      "@scope/tool@2.0.0(peer@1.0.0)": { dependencies: { shared: "1.0.0" } },
      "shared@1.0.0": { dependencies: { compiler: "typescript@6.0.3" } },
    },
  });
  expect(result.status, result.stderr).toBe(0);
  const data = JSON.parse(result.stdout);
  const resolved = data.manifests["pnpm-lock.yaml"].resolved;
  expect(Object.keys(resolved)).toHaveLength(3);
  expect(resolved["pkg:npm/typescript@6.0.3"]).toMatchObject({
    relationship: "direct",
    scope: "runtime",
    dependencies: ["pkg:npm/shared@1.0.0"],
  });
  expect(resolved["pkg:npm/%40scope/tool@2.0.0"]).toMatchObject({
    relationship: "direct",
    scope: "development",
  });
  expect(resolved["pkg:npm/shared@1.0.0"]).toMatchObject({
    relationship: "indirect",
    scope: "runtime",
  });
  expect(data.sha).toBe(environment.GITHUB_SHA);
  expect(data.detector.name).toBe("smolter-pnpm-lockfile");
});
it("rejects unresolved and empty graphs rather than replacing GitHub's snapshot", () => {
  const empty = snapshot({
    lockfileVersion: "9.0",
    packages: {},
    snapshots: {},
  });
  expect(empty.status).toBe(1);
  expect(empty.stderr).toContain("empty dependency graph");
  const missing = snapshot({
    lockfileVersion: "9.0",
    packages: { "tool@1.0.0": {} },
    snapshots: { "tool@1.0.0": { dependencies: { missing: "2.0.0" } } },
  });
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("Dependency missing from lockfile");
});
