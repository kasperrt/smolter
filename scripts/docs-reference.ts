import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import { API, SymbolFlags } from "typescript/unstable/sync";

interface ReferenceField {
  name: string;
  signature: string;
  summary: string;
}

interface ReferencePage {
  slug: string;
  title: string;
  entries: string[];
  kind: "API" | "Types";
  summary: string;
  signature: string;
  fields: ReferenceField[];
  source: string;
}

interface AuthoredSection {
  code: string;
}

interface AuthoredPage {
  sections: AuthoredSection[];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const api = new API({ cwd: process.cwd() });
const snapshot = api.updateSnapshot({
  openProjects: [resolve("tsconfig.json")],
});
const { program, checker, compilerOptions } = snapshot.getProjects()[0];
// The native API accepts TypeFormatFlags but does not export their enum.
const noTruncation = 1;
const pages = new Map<string, ReferencePage>();

for (const entry of [
  "react",
  "preact",
  "react/nested",
  "preact/nested",
  "react/client",
  "preact/client",
  "preact/document",
  "react/document",
  "react/server",
  "preact/server",
  "react/vite",
  "preact/vite",
  "utils",
  "utils/http",
]) {
  const path = compilerOptions.paths?.[`@kasperrt/smolter/${entry}`]?.[0];
  if (!path) fail(`Missing tsconfig path for @kasperrt/smolter/${entry}`);
  const source = program.getSourceFile(resolve(path.replace(/^\.\//, "")));
  if (!source) fail(`Missing source for @kasperrt/smolter/${entry}`);
  const module = checker.getSymbolAtLocation(source);
  if (!module) fail(`Missing module symbol for @kasperrt/smolter/${entry}`);
  for (const exported of checker.getExportsOfModule(module)) {
    const name = exported.name;
    const symbol =
      exported.flags & SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported;
    const declaration = symbol.declarations[0]?.resolve();
    if (!declaration) continue;
    const isType =
      ts.isInterfaceDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration);
    // Type-only star re-exports do not make core values available at runtime.
    if (
      ["react", "preact", "react/nested", "preact/nested"].includes(entry) &&
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
    const functions = symbol.declarations
      .map((handle) => handle.resolve())
      .filter(
        (node): node is ts.FunctionDeclaration =>
          node !== undefined && ts.isFunctionDeclaration(node),
      );
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
        ? `const ${name}: ${checker.typeToString(type, declaration, noTruncation)};`
        : declaration.getText(file).replace(/^export /, "");
    const summary = symbol.getDocumentationComment(checker);
    const fields = ts.isInterfaceDeclaration(declaration)
      ? declaration.members.map((member): ReferenceField => {
          const memberName =
            ts.isPropertySignatureDeclaration(member) ||
            ts.isMethodSignatureDeclaration(member) ||
            ts.isGetAccessorDeclaration(member) ||
            ts.isSetAccessorDeclaration(member)
              ? member.name
              : undefined;
          return {
            name: memberName?.getText(file) ?? "index",
            signature: member.getText(file),
            summary:
              (memberName &&
                checker
                  .getSymbolAtLocation(memberName)
                  ?.getDocumentationComment(checker)) ??
              "",
          };
        })
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

api.close();
const output = "packages/ui/src/docs/reference.json";
const saved: ReferencePage[] = JSON.parse(readFileSync(output, "utf8"));
// Keep the existing guide order when compiler export enumeration changes.
const order = new Map(saved.map((page, index) => [page.slug, index]));
const content = [...pages.values()].sort(
  (a, b) =>
    (order.get(a.slug) ?? saved.length) - (order.get(b.slug) ?? saved.length),
);

function writeReference() {
  if (!process.argv.includes("--check")) {
    writeFileSync(output, JSON.stringify(content, null, 2) + "\n");
    return;
  }
  if (JSON.stringify(saved) !== JSON.stringify(content)) {
    console.error(
      "Public API documentation is stale. Run pnpm docs:reference.",
    );
    process.exit(1);
  }
  for (const page of content) {
    const authored: AuthoredPage = JSON.parse(
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
}
writeReference();

console.log(`Documented ${pages.size} public exports.`);
