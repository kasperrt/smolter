import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const publish = process.argv.includes("--publish");

if (publish && process.env.GITHUB_ACTIONS !== "true") {
  console.error("JSR publishing requires GitHub Actions.");
  process.exit(1);
}

execFileSync("pnpm", ["build"], { stdio: "inherit" });

const source = new URL("../", import.meta.url);
const directory = mkdtempSync(join(tmpdir(), "smolter-jsr-"));

for (const file of [
  ".generated",
  "jsr.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
]) {
  cpSync(new URL(file, source), join(directory, file), { recursive: true });
}

execFileSync(
  "pnpm",
  [
    "dlx",
    "deno@2.9.6",
    "publish",
    ...(!publish ? ["--dry-run"] : []),
    "--allow-dirty",
    "--node-modules-dir=auto",
  ],
  {
    cwd: directory,
    stdio: "inherit",
  },
);

rmSync(directory, { recursive: true });
