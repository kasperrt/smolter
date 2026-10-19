import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import timers from "node:timers/promises";

const scenario = process.env.RELEASE_TEST_SCENARIO;
const npmOnly = process.argv[2] === "publish-npm";
const version = process.env.RELEASE_TEST_VERSION || "0.0.1-rc.1";
const readFileSync = fs.readFileSync;

fs.readFileSync = (file, ...args) => {
  const contents = readFileSync(file, ...args);
  if (/\/(package|jsr)\.json$/.test(String(file)))
    return JSON.stringify({ ...JSON.parse(contents), version });
  return contents;
};

let publications = 0;
let jsrPublications = 0;
let jsrVisible = false;
let waits = 0;
let elapsed = 0;
Date.now = () => elapsed;

timers.setTimeout = async (delay) => {
  assert.equal(delay, publications ? 30_000 : 5_000);
  waits++;
  elapsed += delay;
};

globalThis.fetch = async (input, options) => {
  assert.ok(options.signal instanceof AbortSignal);
  const url = new URL(input);
  if (url.hostname === "jsr.io") {
    assert.equal(npmOnly, false, "npm must not query JSR");
    if (scenario === "jsr-unavailable")
      return new Response(null, { status: 503 });
    jsrVisible =
      !scenario?.startsWith("jsr-") ||
      (jsrPublications > 0 && scenario === "jsr-delayed" && waits >= 2);
    return new Response(null, { status: jsrVisible ? 200 : 404 });
  }
  assert.equal(url.hostname, "registry.npmjs.org");
  const packageLookup = url.pathname === "/@kasperrt/smolter";
  const exists =
    scenario === "published" ||
    (publications > 0 &&
      scenario !== "staged" &&
      (scenario !== "delayed" || waits >= 2) &&
      (scenario !== "long-delay" || waits >= 20)) ||
    (packageLookup && scenario === "existing");
  return new Response(null, { status: exists ? 200 : 404 });
};

childProcess.execFileSync = (binary, args, options) => {
  if (binary === "node") {
    assert.deepEqual(args, ["scripts/jsr.mjs", "--publish"]);
    jsrPublications++;
    if (scenario === "jsr-rejected")
      throw new Error("JSR rejected publication");
    return "";
  }
  if (!npmOnly) assert.ok(jsrVisible, "combined publishing verifies JSR");
  assert.equal(binary, "npm");
  assert.deepEqual(args, [
    "publish",
    "--access",
    "public",
    "--provenance",
    "--tag",
    version.includes("-beta.")
      ? "beta"
      : version.includes("-")
        ? "next"
        : "latest",
  ]);
  assert.equal(options.env.SMOLTER_NPM_BOOTSTRAP_TOKEN, undefined);
  assert.equal(options.env.NODE_AUTH_TOKEN, undefined);
  publications++;
  return "";
};

fs.writeFileSync = (file, contents) => {
  assert.ok(String(file).endsWith("/README.md"));
  assert.ok(contents.includes("<!-- bundlejs:start -->"));
  assert.ok(contents.includes("deno.bundlejs.com"));
};

syncBuiltinESMExports();

process.on("exit", (code) => {
  if (code === 0)
    assert.equal(
      publications,
      scenario === "published" || process.argv[2] === "publish-jsr" ? 0 : 1,
    );
  if (
    !npmOnly &&
    ["jsr-rejected", "jsr-missing", "jsr-unavailable"].includes(scenario)
  )
    assert.equal(publications, 0);
  assert.equal(
    waits,
    npmOnly && scenario?.startsWith("jsr-")
      ? 0
      : ["delayed", "jsr-delayed"].includes(scenario)
        ? 2
        : scenario === "long-delay"
          ? 20
          : scenario === "staged"
            ? 30
            : scenario === "jsr-missing"
              ? 3
              : 0,
  );
});
