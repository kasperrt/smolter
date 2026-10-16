import { readFileSync, writeFileSync } from "node:fs";
import { measure, measureAdapters } from "./measure.mjs";

const sizes = await measureAdapters();
const path = new URL("../packages/ui/src/size.json", import.meta.url);
const json = `${JSON.stringify(sizes, null, 2)}\n`;

if (readFileSync(path, "utf8") !== json) writeFileSync(path, json);

if (!process.argv.includes("--write-only")) {
  for (const [adapter, baseline] of [
    ["react", "wouter"],
    ["preact", "wouter-preact"],
  ]) {
    const actual = sizes[adapter];
    const reference = await measure(baseline);

    console.log(
      `${adapter}: ${actual} B gzip; ${baseline}: ${reference} B; with optional server transport: ${sizes[`${adapter}Server`]} B`,
    );

    if (actual >= reference || actual >= 2100) process.exitCode = 1;
  }

  console.log(
    `core: ${await measure("./packages/smolter/src/core.ts")} B gzip`,
  );
  console.log(
    "All exports, identical minifiers, gzip level 9. Frameworks excluded. File discovery runs at build time.",
  );
}
