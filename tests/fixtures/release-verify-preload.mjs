import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const scenario = process.env.RELEASE_TEST_SCENARIO;
const sha = process.env.RELEASE_SHA;

const readFileSync = fs.readFileSync;
fs.readFileSync = (file, ...args) => {
  const contents = readFileSync(file, ...args);
  if (/\/(package|jsr)\.json$/.test(String(file)))
    return JSON.stringify({
      ...JSON.parse(contents),
      version: process.env.RELEASE_TEST_VERSION || "0.4.4",
    });
  return contents;
};

globalThis.fetch = async (input) => {
  const url = new URL(input);

  if (scenario === "registry-error") return new Response(null, { status: 503 });
  if (scenario === "bootstrap") return new Response(null, { status: 404 });
  if (scenario === "partial" && url.hostname === "jsr.io")
    return new Response(null, { status: 404 });

  return Response.json({
    gitHead: scenario === "retry" ? sha : "released-sha",
  });
};

childProcess.execFileSync = (binary, args) => {
  assert.equal(binary, "gh");

  if (args[1].endsWith("/pulls"))
    return JSON.stringify(
      scenario === "merged"
        ? [
            {
              merged_at: "2026-10-16",
              base: { ref: "main", repo: { full_name: "kasperrt/smolter" } },
              merge_commit_sha: sha,
            },
          ]
        : [],
    );

  if (args[1].includes("/pulls?")) {
    const candidate = {
      merged_at: scenario === "unmerged" ? null : "2026-10-16",
      base: {
        ref: scenario === "wrong-base" ? "other" : "main",
        repo: {
          full_name:
            scenario === "wrong-repo" ? "other/smolter" : "kasperrt/smolter",
        },
      },
      merge_commit_sha: scenario === "wrong-sha" ? "other-sha" : sha,
    };

    return JSON.stringify(
      [
        "unindexed",
        "unmerged",
        "wrong-sha",
        "wrong-base",
        "wrong-repo",
      ].includes(scenario)
        ? [candidate]
        : [],
    );
  }

  assert.equal(args[1], "repos/kasperrt/smolter/git/ref/heads/main");

  return JSON.stringify({
    object: { sha: scenario === "stale" ? "newer-sha" : sha },
  });
};

syncBuiltinESMExports();
