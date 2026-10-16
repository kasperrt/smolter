import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import timers from "node:timers/promises";

const scenario = process.env.RELEASE_TEST_SCENARIO;
let publications = 0;
let waits = 0;

timers.setTimeout = async (delay) => {
  assert.equal(delay, 15_000);
  waits++;
};

globalThis.fetch = async (input) => {
  const url = new URL(input);

  if (url.hostname === "jsr.io") return new Response(null);

  assert.equal(url.hostname, "registry.npmjs.org");

  const packageLookup = url.pathname === "/@kasperrt/smolter";
  const exists =
    scenario === "published" ||
    (publications > 0 &&
      scenario !== "staged" &&
      (scenario !== "delayed" || waits >= 2)) ||
    (packageLookup && scenario === "existing");

  return new Response(null, { status: exists ? 200 : 404 });
};

childProcess.execFileSync = (binary, args, options) => {
  assert.equal(binary, "npm");
  assert.deepEqual(args, [
    "publish",
    "--access",
    "public",
    "--provenance",
    "--tag",
    "next",
  ]);
  assert.equal(options.env.SMOLTER_NPM_BOOTSTRAP_TOKEN, undefined);
  assert.equal(options.env.NODE_AUTH_TOKEN, undefined);

  publications++;

  return "";
};

fs.writeFileSync = (file, contents) => {
  assert.ok(String(file).endsWith("/packages/smolter/README.md"));
  assert.ok(contents.includes("<!-- bundlejs:start -->"));
  assert.ok(contents.includes("deno.bundlejs.com"));
};

syncBuiltinESMExports();

process.on("exit", (code) => {
  if (code === 0) assert.equal(publications, scenario === "published" ? 0 : 1);
  assert.equal(
    waits,
    scenario === "delayed" ? 2 : scenario === "staged" ? 19 : 0,
  );
});
