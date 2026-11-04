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
execFileSync("pnpm", ["pack", "--pack-destination", directory], {
  stdio: "inherit",
});

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const tarball = join(
  directory,
  `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`,
);

const packedManifest = JSON.parse(
  execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
    encoding: "utf8",
  }),
);
for (const field of ["dependencies", "optionalDependencies", "peerDependencies"])
  for (const version of Object.values(packedManifest[field] || {}))
    assert.doesNotMatch(version, /^(catalog|workspace|file|link):/);

const cases = [
  { framework: "react", version: "18.0.0" },
  { framework: "react", version: "19.3.1" },
  { framework: "preact", version: "11.0.1" },
  { framework: "preact", version: "11.1.1" },
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
      : [
          `preact@${version}`,
          `preact-render-to-string@${version === "11.0.1" ? "6.8.1" : "6.8.2"}`,
        ];
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      ...deps,
      "typescript@7.0.2",
      "vite@8.3.5",
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
    readFileSync(
      `packages/integration-tests/tests/fixtures/${framework}-packed.mjs`,
      "utf8",
    ),
  );
  execFileSync(process.execPath, [resolve(cwd, "smoke.mjs")], {
    cwd,
    stdio: "inherit",
  });
  writeFileSync(
    join(cwd, "consumer.ts"),
    readFileSync(
      "packages/integration-tests/tests/fixtures/packed-types.ts",
      "utf8",
    ).replaceAll("@kasperrt/smolter/react", `${manifest.name}/${framework}`),
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
  writeFileSync(
    join(cwd, "prefetch.mjs"),
    readFileSync(
      "packages/integration-tests/tests/fixtures/prefetch-packed.mjs",
      "utf8",
    ),
  );
  execFileSync(process.execPath, ["prefetch.mjs", framework], {
    cwd,
    stdio: "inherit",
  });
  rmSync(cwd, { recursive: true, force: true });
}

rmSync(directory, { recursive: true, force: true });
