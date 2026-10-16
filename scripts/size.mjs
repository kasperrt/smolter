import { readFileSync, writeFileSync } from "node:fs";
import { measure, measureAdapters } from "./measure.mjs";

const sizes = await measureAdapters();
const path = new URL("../packages/ui/src/size.json", import.meta.url);
const json = `${JSON.stringify(sizes, null, 2)}\n`;

if (readFileSync(path, "utf8") !== json) writeFileSync(path, json);

if (!process.argv.includes("--write-only")) {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const references = await Promise.all(
    ["wouter", "wouter-preact", "react-router"].map(async (name) => ({
      name,
      version: manifest.devDependencies[name],
      bytes: await measure(name),
    })),
  );
  const rows = [
    ["@kasperrt/smolter/react", sizes.react],
    ["@kasperrt/smolter/preact", sizes.preact],
    ["@kasperrt/smolter/react + @kasperrt/smolter/client", sizes.reactServer],
    ["@kasperrt/smolter/preact + @kasperrt/smolter/client", sizes.preactServer],
    ...references.map(({ name, version, bytes }) => [
      `${name}@${version}`,
      bytes,
    ]),
  ];
  const table = [
    "<!-- size-comparison:start -->",
    "| Browser exports | Gzip bytes |",
    "| --- | ---: |",
    ...rows.map(([name, bytes]) => `| \`${name}\` | ${bytes} |`),
    "<!-- size-comparison:end -->",
  ].join("\n");

  for (const file of ["README.md", "packages/smolter/README.md"]) {
    const url = new URL(`../${file}`, import.meta.url);
    const source = readFileSync(url, "utf8");
    const updated = source.replace(
      /<!-- size-comparison:start -->[\s\S]*?<!-- size-comparison:end -->/,
      table,
    );

    if (source !== updated) writeFileSync(url, updated);
  }

  for (const [name, bytes] of rows) console.log(`${name}: ${bytes} B gzip`);

  for (const [index, adapter] of ["react", "preact"].entries()) {
    if (sizes[adapter] >= references[index].bytes) {
      console.error(
        `${adapter} must be smaller than ${references[index].name}`,
      );
      process.exitCode = 1;
    }
  }

  console.log(
    "All exports, identical minifiers, gzip level 9. Frameworks excluded; runtime dependencies included.",
  );
}
