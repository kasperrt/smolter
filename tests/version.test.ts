import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

const script = resolve("scripts/version.mjs");

for (const [current, command, expected] of [
  ["0.0.1-rc.1", "release", "0.0.1"],
  ["0.0.1-rc.1", "patch", "0.0.2"],
  ["0.0.1-rc.1", "minor", "0.1.0"],
  ["0.0.1", "patch", "0.0.2"],
  ["1.9.9+build.2", "minor", "1.10.0"],
  ["0.0.1", "release", undefined],
  ["0.0.1-rc.1", "unknown", undefined],
  ["0.0.NaN", "patch", undefined],
  ["01.0.1", "patch", undefined],
  ["0.0.1-01", "release", undefined],
  ["0.0.1-rc..1", "release", undefined],
  ["0.0.1-rc.1", "mismatched", undefined],
] as const) {
  it(`handles ${command} for ${current} without corrupting either manifest`, (context) => {
    const cwd = mkdtempSync(join(tmpdir(), "smolter-version-"));
    const directory = cwd;
    const files = ["package.json", "jsr.json"];
    context.onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
    mkdirSync(directory, { recursive: true });
    const originals = files.map((file) => {
      const version =
        command === "mismatched" && file === "jsr.json" ? "0.0.2" : current;
      const contents = JSON.stringify({
        name: "test",
        version,
        description: "Preserve this",
      });
      writeFileSync(join(directory, file), contents);
      return contents;
    });
    const result = spawnSync(
      process.execPath,
      [script, command === "mismatched" ? "release" : command],
      { cwd, encoding: "utf8" },
    );
    expect(result.status).toBe(expected ? 0 : 1);
    for (const [index, file] of files.entries()) {
      const contents = readFileSync(join(directory, file), "utf8");
      if (!expected) {
        expect(contents).toBe(originals[index]);
        continue;
      }
      expect(JSON.parse(contents)).toEqual({
        name: "test",
        version: expected,
        description: "Preserve this",
      });
    }
  });
}
