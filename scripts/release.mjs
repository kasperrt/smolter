import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { withSizeBadges } from "./badges.mjs";

const directory = new URL("../packages/smolter/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", directory)));
const jsr = JSON.parse(readFileSync(new URL("jsr.json", directory)));
const repository = "kasperrt/smolter";
const sha = process.env.RELEASE_SHA;
const mode = process.argv[2];
const prerelease = manifest.version.includes("-");

function command(binary, args, options = {}) {
  return execFileSync(binary, args, { stdio: "inherit", ...options });
}

function github(path) {
  return JSON.parse(
    command("gh", ["api", path], { stdio: "pipe", encoding: "utf8" }),
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function published(url) {
  const response = await fetch(url);

  if (response.status === 404) return false;

  if (!response.ok) fail(`Registry check failed: ${response.status} ${url}`);

  return true;
}

if (manifest.version !== jsr.version) fail("npm and JSR versions must match.");

if (mode === "verify") {
  if (process.env.GITHUB_ACTIONS !== "true" || !sha)
    fail("Release requires GitHub Actions.");

  const pulls = github(`repos/${repository}/commits/${sha}/pulls`);
  const merged = pulls.some(
    (pr) =>
      pr.merged_at &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository &&
      pr.merge_commit_sha === sha,
  );

  if (!merged) {
    const npm = await fetch(
      `https://registry.npmjs.org/${manifest.name}/0.0.1`,
    );

    if (!npm.ok && npm.status !== 404)
      fail(`Registry check failed: ${npm.status}`);

    const jsrReleased = await published(
      "https://jsr.io/@kasperrt/smolter/0.0.1_meta.json",
    );
    const npmRelease = npm.ok ? await npm.json() : undefined;

    // Allow the initial release commit to finish Pages or retry a partial release.
    if (npmRelease && jsrReleased && npmRelease.gitHead !== sha)
      fail("After 0.0.1, release commits must come from a merged PR to main.");
  }

  const main = github(`repos/${repository}/git/ref/heads/main`);

  if (main.object.sha !== sha)
    fail("A newer main commit exists; release that commit instead.");
}

if (mode === "publish") {
  if (process.env.GITHUB_ACTIONS !== "true")
    fail("Publishing requires GitHub Actions.");

  const npmExists = await published(
    `https://registry.npmjs.org/${manifest.name}/${manifest.version}`,
  );
  const jsrExists = await published(
    `https://jsr.io/${jsr.name}/${jsr.version}_meta.json`,
  );

  // Registry README badges become visible only when this version is published.
  const readme = new URL("README.md", directory);

  writeFileSync(
    readme,
    withSizeBadges(readFileSync(readme, "utf8"), manifest.version),
  );

  if (!npmExists) {
    const env = { ...process.env };

    delete env.SMOLTER_NPM_BOOTSTRAP_TOKEN;
    delete env.NODE_AUTH_TOKEN;

    command(
      "npm",
      [
        "publish",
        "--access",
        "public",
        "--provenance",
        "--tag",
        prerelease ? "next" : "latest",
      ],
      {
        cwd: directory,
        env,
      },
    );
  }

  if (!jsrExists) command("node", ["scripts/jsr.mjs", "--publish"]);

  if (
    !(await published(
      `https://registry.npmjs.org/${manifest.name}/${manifest.version}`,
    )) ||
    !(await published(`https://jsr.io/${jsr.name}/${jsr.version}_meta.json`))
  )
    fail(
      "Registry publication is incomplete. A staged npm upload is not a released version.",
    );
}

if (mode === "tag") {
  const tag = `v${manifest.version}`;
  const releases = github(`repos/${repository}/releases?per_page=100`);

  if (!releases.some((release) => release.tag_name === tag)) {
    command("gh", [
      "release",
      "create",
      tag,
      "--repo",
      repository,
      "--target",
      sha,
      "--title",
      tag,
      ...(prerelease ? ["--prerelease"] : []),
      "--notes-file",
      "CHANGELOG.md",
    ]);
  }
}
