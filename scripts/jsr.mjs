import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const publish = process.argv.includes("--publish");

if (publish && process.env.GITHUB_ACTIONS !== "true") {
  console.error("JSR publishing requires GitHub Actions.");
  process.exit(1);
}

execFileSync("pnpm", ["build"], { stdio: "inherit" });

const source = new URL("../", import.meta.url);
// JSR's hosted validation rejects global augmentation even when Deno's dry run passes.
for (const file of readdirSync(new URL(".generated/", source), {
  recursive: true,
})) {
  if (!/\.tsx?$/.test(file)) continue;

  const tree = ts.createSourceFile(
    file,
    readFileSync(new URL(`.generated/${file}`, source), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const inspect = (node) => {
    if (
      ts.isModuleDeclaration(node) &&
      node.flags & ts.NodeFlags.GlobalAugmentation
    ) {
      console.error(`JSR forbids global type augmentation: ${file}`);
      process.exit(1);
    }
    ts.forEachChild(node, inspect);
  };
  inspect(tree);
}

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
