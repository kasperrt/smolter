import { readFileSync, writeFileSync } from "node:fs";
import { commonExports, measure, measureAdapters } from "./measure.mjs";

const path = new URL("../packages/ui/src/size.json", import.meta.url);
const previous = JSON.parse(readFileSync(path, "utf8"));
// Dependency comparisons are refreshed by pnpm size, not every example build.
const sizes = await measureAdapters(
  process.argv.includes("--write-only") ? previous : {},
);
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
  const sharedExports = commonExports;
  const shared = [sizes.reactCommon, sizes.preactCommon];
  const rows = [
    ["React Router: declarative routing subset", sizes.reactRouterRouting],
    ["React Router: data routing subset", sizes.reactRouterData],
    ["React: routing-only named exports", sizes.reactRouting],
    ["Preact: routing-only named exports", sizes.preactRouting],
    ["@kasperrt/smolter/react", sizes.react],
    ["@kasperrt/smolter/preact", sizes.preact],
    [
      "@kasperrt/smolter/react + @kasperrt/smolter/react/client",
      sizes.reactServer,
    ],
    ["@kasperrt/smolter/preact + server transport", sizes.preactServer],
    [
      "@kasperrt/smolter/preact + client + document (application without lazy routes)",
      sizes.preactApplication,
    ],
    [
      "@kasperrt/smolter/preact + client + document + lazy-route (file-routed application)",
      sizes.preactLazyApplication,
    ],
    ["@kasperrt/smolter/react/data (optional resource API)", sizes.reactData],
    ["React: common routing/data exports", shared[0]],
    ["Preact: common routing/data exports", shared[1]],
    [
      "wouter: routing subset (Router, Route, Switch, Link, useParams, useLocation)",
      sizes.wouterRouting,
    ],
    ["wouter-preact: same routing subset", sizes.wouterPreactRouting],
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

  for (const file of ["README.md"]) {
    const url = new URL(`../${file}`, import.meta.url);
    const source = readFileSync(url, "utf8");
    const updated = source.replace(
      /<!-- size-comparison:start -->[\s\S]*?<!-- size-comparison:end -->/,
      table,
    );

    if (source !== updated) writeFileSync(url, updated);
  }

  for (const [name, bytes] of rows) console.log(`${name}: ${bytes} B gzip`);

  if (process.argv.includes("--breakdown")) {
    console.log(
      "Marginal gzip bytes: the common bundle minus the same bundle without one export.",
    );
    console.log(
      "Shared code and gzip compression mean these values are not additive.",
    );

    for (const [index, adapter] of ["react", "preact"].entries()) {
      const entry = `./dist/${adapter}/index.js`;
      const breakdown = await Promise.all(
        sharedExports.map(async (name) => {
          const remaining = sharedExports.filter(
            (candidate) => candidate !== name,
          );
          const without = await measure(entry, remaining);

          return `${adapter}.${name}: ${shared[index] - without} B`;
        }),
      );

      for (const line of breakdown) console.log(line);
    }
  }

  for (const [index, adapter] of ["react", "preact"].entries()) {
    if (
      [sizes.reactRouting, sizes.preactRouting][index] >=
      [sizes.wouterRouting, sizes.wouterPreactRouting][index]
    ) {
      console.error(
        `${adapter}: routing-only named exports must remain smaller than the routing subset of ${references[index].name}`,
      );
      process.exitCode = 1;
    }
  }

  console.log(
    "Named subsets where labeled; otherwise all exports. Identical minifiers, gzip level 9. Frameworks excluded; runtime dependencies included.",
  );
}
