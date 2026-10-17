import { readFile, writeFile } from "node:fs/promises";

const files = ["package.json", "jsr.json"];
const manifests = await Promise.all(
  files.map(async (file) => JSON.parse(await readFile(file, "utf8"))),
);
const current = manifests[0].version;
const numeric = "(0|[1-9]\\d*)";
const identifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][\\dA-Za-z-]*)";
const pattern = new RegExp(
  `^${numeric}\\.${numeric}\\.${numeric}(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[\\dA-Za-z-]+(?:\\.[\\dA-Za-z-]+)*)?$`,
);
const match = pattern.exec(current);

if (!match || manifests.some((manifest) => manifest.version !== current)) {
  console.error("npm and JSR must have the same valid version before bumping.");
  process.exit(1);
}

const [major, minor, patch] = match.slice(1, 4).map(Number);
const versions = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  release: match[4] && `${major}.${minor}.${patch}`,
};
const version = versions[process.argv[2]];

if (typeof version !== "string") {
  console.error("Use patch, minor, or release (to promote a prerelease).");
  process.exit(1);
}

for (const [index, file] of files.entries()) {
  manifests[index].version = version;
  await writeFile(file, `${JSON.stringify(manifests[index], null, 2)}\n`);
}

console.log(`Version: ${version}. Update CHANGELOG.md before releasing.`);
