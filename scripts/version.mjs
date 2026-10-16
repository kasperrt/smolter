import { readFile, writeFile } from "node:fs/promises";

const files = ["packages/smolter/package.json", "packages/smolter/jsr.json"];
const manifest = JSON.parse(await readFile(files[0], "utf8"));
const [major, minor, patch] = manifest.version.split(".").map(Number);
const versions = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
};
const version = versions[process.argv[2]];

if (!version) {
  console.error("Use patch or minor");
  process.exit(1);
}

for (const file of files) {
  const value = JSON.parse(await readFile(file, "utf8"));
  value.version = version;
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
console.log(`Version: ${version}. Update CHANGELOG.md before releasing.`);
