import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const tarball = join(directory, `smolter-${manifest.version}.tgz`);

for (const framework of ["react", "preact"]) {
  const cwd = mkdtempSync(join(tmpdir(), `smolter-${framework}-`));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );

  const deps =
    framework === "react"
      ? ["react@19.3.1", "react-dom@19.3.1"]
      : ["preact@11.0.1", "preact-render-to-string@6.8.1"];
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      tarball,
      ...deps,
    ],
    { cwd, stdio: "inherit" },
  );

  writeFileSync(
    join(cwd, "smoke.mjs"),
    readFileSync(`tests/fixtures/${framework}-packed.mjs`, "utf8"),
  );

  execFileSync(process.execPath, [resolve(cwd, "smoke.mjs")], {
    cwd,
    stdio: "inherit",
  });
}
