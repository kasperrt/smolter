import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import ts from "typescript";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const pages = new Map();

for (const entry of [
  "react",
  "preact",
  "react/client",
  "preact/client",
  "preact/document",
  "react/server",
  "preact/server",
  "react/vite",
  "preact/vite",
  "utils",
  "utils/http",
]) {
  const filename = parsed.options.paths[
    `@kasperrt/smolter/${entry}`
  ][0].replace(/^\.\//, "");
  const source = program.getSourceFile(filename);
  const module = checker.getSymbolAtLocation(source);

  for (const exported of checker.getExportsOfModule(module)) {
    const name = exported.name;
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const declaration = symbol.declarations?.[0];

    if (!declaration) continue;

    const isType =
      ts.isInterfaceDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration);

    // Type-only star re-exports do not make core values available at runtime.
    if (
      ["react", "preact"].includes(entry) &&
      !isType &&
      declaration.getSourceFile().fileName.includes("/core/") &&
      !["createRouter", "createDataRouter", "defineRoute"].includes(name)
    )
      continue;

    const existing = pages.get(name);

    if (existing) {
      existing.entries.push(entry);
      continue;
    }

    const file = declaration.getSourceFile();
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const functions = symbol.declarations.filter(ts.isFunctionDeclaration);
    const overloads = functions.some((item) => !item.body)
      ? functions.filter((item) => !item.body)
      : functions;
    const signature = ts.isFunctionDeclaration(declaration)
      ? overloads
          .map(
            (item) =>
              item
                .getText(file)
                .split(item.body?.getText(file) ?? "\0")[0]
                .trim()
                .replace(/^export (async )?/, "")
                .replace(/;$/, "") + ";",
          )
          .join("\n\n")
      : ts.isVariableDeclaration(declaration)
        ? `const ${name}: ${checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation)};`
        : declaration.getText(file).replace(/^export /, "");
    const summary = ts.displayPartsToString(
      symbol.getDocumentationComment(checker),
    );
    const fields = ts.isInterfaceDeclaration(declaration)
      ? declaration.members.map((member) => ({
          name: member.name?.getText(file) ?? "index",
          signature: member.getText(file),
          summary: ts.displayPartsToString(
            checker
              .getSymbolAtLocation(member.name)
              ?.getDocumentationComment(checker) ?? [],
          ),
        }))
      : [];

    pages.set(name, {
      slug: name,
      title: name,
      entries: [entry],
      kind:
        ts.isInterfaceDeclaration(declaration) ||
        ts.isTypeAliasDeclaration(declaration)
          ? "Types"
          : "API",
      summary,
      signature,
      fields,
      source: relative(process.cwd(), file.fileName).replaceAll("\\", "/"),
    });
  }
}

const output = "packages/ui/src/docs/reference.json";
const content = [...pages.values()];

if (process.argv.includes("--check")) {
  const saved = JSON.parse(readFileSync(output, "utf8"));

  if (JSON.stringify(saved) !== JSON.stringify(content)) {
    console.error(
      "Public API documentation is stale. Run pnpm docs:reference.",
    );
    process.exit(1);
  }

  for (const page of content) {
    const authored = JSON.parse(
      readFileSync(`packages/ui/src/docs/pages/${page.slug}.json`, "utf8"),
    );

    if (
      authored.sections.length < (page.kind === "API" ? 4 : 1) ||
      !authored.sections.some((section) => section.code) ||
      authored.sections.some((section) =>
        /from ["']smolter(?:\/|["'])/.test(section.code),
      )
    ) {
      console.error(`Missing detailed API documentation: ${page.slug}`);
      process.exit(1);
    }
  }
} else {
  writeFileSync(output, JSON.stringify(content, null, 2) + "\n");
}

console.log(`Documented ${pages.size} public exports.`);
