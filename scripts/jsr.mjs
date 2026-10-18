import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript-compiler";

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

const directory = realpathSync(mkdtempSync(join(tmpdir(), "smolter-jsr-")));

for (const file of [
  ".generated",
  "jsr.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
]) {
  cpSync(new URL(file, source), join(directory, file), { recursive: true });
}

// Check the same source documentation that JSR indexes, before either registry publishes.
const manifest = JSON.parse(readFileSync(join(directory, "jsr.json"), "utf8"));
const documentation = JSON.parse(
  execFileSync(
    "pnpm",
    [
      "dlx",
      "deno@2.9.6",
      "doc",
      "--node-modules-dir=auto",
      "--json",
      "--import-map",
      join(directory, "jsr.json"),
      ...Object.values(manifest.exports).map((entry) => join(directory, entry)),
    ],
    { cwd: directory, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
);
const locationKey = (location) =>
  `${location.filename}:${location.line}:${location.col}`;
const declarations = new Map(
  Object.values(documentation.nodes).flatMap((module) =>
    module.symbols.flatMap((symbol) =>
      symbol.declarations.map((declaration) => [
        locationKey(declaration.location),
        declaration,
      ]),
    ),
  ),
);
const documented = (declaration) => {
  if (declaration.kind === "reference") {
    const target = declarations.get(locationKey(declaration.def.target));
    return target && target !== declaration && documented(target);
  }
  return Boolean(declaration.jsDoc?.doc?.trim());
};
for (const [entry, module] of Object.entries(documentation.nodes)) {
  if (!module.module_doc?.doc?.trim()) {
    throw new Error(`Missing JSR entrypoint documentation: ${entry}`);
  }
  for (const symbol of module.symbols) {
    const exported = symbol.declarations.filter(
      (declaration) => declaration.declarationKind === "export",
    );
    if (exported.length && !exported.some(documented)) {
      throw new Error(
        `Missing JSR symbol documentation: ${entry}: ${symbol.name}`,
      );
    }
  }
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
