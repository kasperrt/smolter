import { readFile, writeFile } from "node:fs/promises";

interface Manifest {
  version: string;
}

type Bump = "patch" | "minor" | "prerelease" | "release";

const files = ["package.json", "jsr.json"];
const manifests: Manifest[] = await Promise.all(
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
const prerelease = match[4];
// Increment the trailing numeric identifier, or start one: alpha.1 -> alpha.2, rc -> rc.1.
function nextPrerelease(identifiers: string): string {
  const parts = identifiers.split(".");
  const last = parts.at(-1) ?? "";
  if (!/^\d+$/.test(last)) return `${identifiers}.1`;
  return [...parts.slice(0, -1), String(Number(last) + 1)].join(".");
}
const versions: Record<Bump, string | undefined> = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  prerelease:
    prerelease && `${major}.${minor}.${patch}-${nextPrerelease(prerelease)}`,
  release: prerelease && `${major}.${minor}.${patch}`,
};
const bump = process.argv[2];
const version = bump && bump in versions ? versions[bump as Bump] : undefined;
if (typeof version !== "string") {
  console.error(
    "Use patch, minor, prerelease (to advance a prerelease), or release (to promote one).",
  );
  process.exit(1);
}
for (const [index, file] of files.entries()) {
  manifests[index].version = version;
  await writeFile(file, `${JSON.stringify(manifests[index], null, 2)}\n`);
}
console.log(`Version: ${version}. Update CHANGELOG.md before releasing.`);
