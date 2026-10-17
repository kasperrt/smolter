import { readFileSync, writeFileSync } from "node:fs";
import { withSizeBadges } from "./badges.mjs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
const responses = await Promise.all([
  fetch(`https://registry.npmjs.org/${name}/${version}`),
  fetch(`https://jsr.io/@kasperrt/smolter/${version}_meta.json`),
]);

if (responses.some((response) => !response.ok)) {
  console.error(
    "Both registry versions must exist before adding public README badges.",
  );
  process.exit(1);
}

for (const file of ["README.md"]) {
  writeFileSync(file, withSizeBadges(readFileSync(file, "utf8"), version));
}
