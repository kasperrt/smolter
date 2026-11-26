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

import { afterAll, beforeAll, expect, test } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "smolter-pack-"));

const vitestPackage = JSON.parse(
  readFileSync(new URL(import.meta.resolve("vitest/package.json")), "utf8"),
);
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const tarball = join(
  directory,
  `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`,
);

beforeAll(() => {
  execFileSync("pnpm", ["pack", "--pack-destination", directory], {
    stdio: "inherit",
  });
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
test("packed manifest resolves dependency protocols", () => {
  const packedManifest = JSON.parse(
    execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
      encoding: "utf8",
    }),
  );
  for (const field of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ])
    for (const version of Object.values(packedManifest[field] || {}))
      expect(version).not.toMatch(/^(catalog|workspace|file|link):/);
});
const cases = [
  { framework: "react", version: "18.0.0" },
  { framework: "react", version: "19.3.1" },
  { framework: "preact", version: "11.0.1" },
  { framework: "preact", version: "11.1.1" },
];
test.for(cases)(
  "packed $framework@$version",
  { timeout: 120_000 },
  ({ framework, version }, { onTestFinished }) => {
    const cwd = mkdtempSync(join(tmpdir(), `smolter-${framework}-`));
    onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
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
        `vitest@${vitestPackage.version}`,
      ],
      { cwd, stdio: "inherit" },
    );
    const other = framework === "react" ? "preact" : "react";
    expect(
      existsSync(join(cwd, "node_modules", other)),
      `${framework} installs must not pull in ${other}`,
    ).toBe(false);
    writeFileSync(
      join(cwd, "consumer.test.js"),
      readFileSync(
        `packages/integration-tests/tests/fixtures/${framework}-packed.test.js`,
        "utf8",
      ),
    );
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
      join(cwd, "prefetch.test.js"),
      readFileSync(
        "packages/integration-tests/tests/fixtures/prefetch-packed.test.js",
        "utf8",
      ),
    );
    execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run"], {
      cwd,
      env: { ...process.env, SMOLTER_PACKED_FRAMEWORK: framework },
      stdio: "inherit",
    });
  },
);
