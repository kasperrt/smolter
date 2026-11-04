import { readFileSync } from "node:fs";
import { parseAllDocuments } from "yaml";

// Read both pnpm's tooling document and the project's dependency document.
const documents = parseAllDocuments(readFileSync("pnpm-lock.yaml", "utf8"));
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
for (const document of documents) {
  if (document.errors.length) fail("Unable to parse the pnpm lockfile");
}
const locks = documents.map((document) => document.toJS());
const resolved = {};
const roots = [];
const normalize = (key) => key.split("(")[0];
const packageUrl = (key) => {
  const normalized = normalize(key);
  const separator = normalized.lastIndexOf("@");
  if (separator < 1) fail(`Unsupported package identity: ${key}`);
  const name = normalized.slice(0, separator).replace(/^@/, "%40");
  const version = normalized.slice(separator + 1);
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    fail(`Unresolved package version: ${key}`);
  }
  return `pkg:npm/${name}@${version}`;
};

for (const lock of locks) {
  if (
    String(lock.lockfileVersion) !== "9.0" ||
    !lock.packages ||
    !lock.snapshots
  ) {
    fail("Expected pnpm lockfile v9 packages and snapshots");
  }
  for (const key of Object.keys(lock.packages)) {
    const url = packageUrl(key);
    resolved[url] ??= {
      package_url: url,
      relationship: "indirect",
      scope: "development",
      dependencies: [],
    };
  }
}

const resolveReference = (name, reference) => {
  if (reference.startsWith("link:")) return null;
  const key = normalize(reference);
  // npm aliases carry the real package name in their resolved version.
  const url = packageUrl(key.includes("@") ? key : `${name}@${key}`);
  if (!resolved[url]) fail(`Dependency missing from lockfile packages: ${url}`);
  return url;
};

for (const lock of locks) {
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    const entry = resolved[packageUrl(key)];
    if (!entry) fail(`Snapshot missing package metadata: ${key}`);
    for (const [name, reference] of Object.entries({
      ...snapshot.dependencies,
      ...snapshot.optionalDependencies,
    })) {
      const url = resolveReference(name, reference);
      if (url && !entry.dependencies.includes(url))
        entry.dependencies.push(url);
    }
  }
  for (const importer of Object.values(lock.importers ?? {})) {
    for (const group of [
      "dependencies",
      "optionalDependencies",
      "devDependencies",
      "configDependencies",
      "packageManagerDependencies",
    ]) {
      for (const [name, reference] of Object.entries(importer[group] ?? {})) {
        const url = resolveReference(name, reference.version);
        if (!url) continue;
        resolved[url].relationship = "direct";
        if (group === "dependencies" || group === "optionalDependencies") {
          roots.push(url);
        }
      }
    }
  }
}

// Runtime wins when a package is reachable from both runtime and development roots.
const visited = new Set();
while (roots.length) {
  const url = roots.pop();
  if (visited.has(url)) continue;
  visited.add(url);
  resolved[url].scope = "runtime";
  roots.push(...resolved[url].dependencies);
}
if (!Object.keys(resolved).length || !visited.size) {
  fail("Refusing to submit an empty dependency graph");
}
for (const entry of Object.values(resolved)) entry.dependencies.sort();
const required = [
  "GITHUB_SHA",
  "GITHUB_REF",
  "GITHUB_RUN_ID",
  "GITHUB_REPOSITORY",
];
for (const name of required) {
  if (!process.env[name]) fail(`Missing ${name}`);
}
const { GITHUB_SHA, GITHUB_REF, GITHUB_RUN_ID, GITHUB_REPOSITORY } =
  process.env;
console.log(
  JSON.stringify({
    version: 0,
    sha: GITHUB_SHA,
    ref: GITHUB_REF,
    job: {
      correlator: "pnpm-lockfile",
      id: GITHUB_RUN_ID,
      html_url: `https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
    },
    detector: {
      name: "smolter-pnpm-lockfile",
      version: "1.0.0",
      url: `https://github.com/${GITHUB_REPOSITORY}`,
    },
    scanned: new Date().toISOString(),
    manifests: {
      "pnpm-lock.yaml": {
        name: "pnpm-lock.yaml",
        file: { source_location: "pnpm-lock.yaml" },
        resolved,
      },
    },
  }),
);
