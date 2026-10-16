import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "smolter-pack-"));
execFileSync(
  "pnpm",
  ["--dir", "packages/smolter", "pack", "--pack-destination", directory],
  { stdio: "inherit" },
);

const manifest = JSON.parse(
  readFileSync("packages/smolter/package.json", "utf8"),
);
const tarball = join(
  directory,
  `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`,
);

const cases = [
  { framework: "react", version: "18.0.0" },
  { framework: "react", version: "19.3.1" },
  { framework: "preact", version: "10.25.0" },
  { framework: "preact", version: "11.0.1" },
];

for (const { framework, version } of cases) {
  console.log(`Checking ${framework}@${version}`);
  const cwd = mkdtempSync(join(tmpdir(), `smolter-${framework}-`));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: {
        [manifest.name]: `file:${tarball}`,
      },
    }),
  );

  const deps =
    framework === "react"
      ? [
          `react@${version}`,
          `react-dom@${version}`,
          `@types/react@${version.startsWith("18.") ? "18.3.27" : "19.3.0"}`,
        ]
      : [`preact@${version}`, "preact-render-to-string@6.8.1"];
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      ...deps,
    ],
    { cwd, stdio: "inherit" },
  );

  const other = framework === "react" ? "preact" : "react";

  assert.equal(
    existsSync(join(cwd, "node_modules", other)),
    false,
    `${framework} installs must not pull in ${other}`,
  );

  writeFileSync(
    join(cwd, "smoke.mjs"),
    readFileSync(`tests/fixtures/${framework}-packed.mjs`, "utf8"),
  );

  execFileSync(process.execPath, [resolve(cwd, "smoke.mjs")], {
    cwd,
    stdio: "inherit",
  });

  writeFileSync(
    join(cwd, "consumer.ts"),
    readFileSync("tests/fixtures/packed-types.ts", "utf8").replaceAll(
      "@kasperrt/smolter/react",
      `${manifest.name}/${framework}`,
    ),
  );
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "false",
      "--module",
      "NodeNext",
      "--target",
      "ES2022",
      "consumer.ts",
    ],
    { cwd, stdio: "inherit" },
  );

  rmSync(cwd, { recursive: true, force: true });
}

rmSync(directory, { recursive: true, force: true });
