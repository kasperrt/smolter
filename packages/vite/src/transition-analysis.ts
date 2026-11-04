import * as ts from "typescript/unstable/ast";
import type { Checker } from "typescript/unstable/sync";

const factories = new Set([
  "mountApplication",
  "createRouter",
  "createDataRouter",
  "createNestedRouter",
]);

function importedFrom(node: ts.Node, module: RegExp): boolean {
  for (
    let current: ts.Node | undefined = node;
    current;
    current = current.parent
  ) {
    if (ts.isImportDeclaration(current))
      return (
        ts.isStringLiteral(current.moduleSpecifier) &&
        module.test(current.moduleSpecifier.text)
      );
  }
  return false;
}

// File route exports are statically known. Manual factories, escaping references
// and computed writes retain support rather than guessing about runtime routes.
export function usesViewTransition(
  sources: readonly ts.SourceFile[],
  checker: Checker,
): boolean {
  let used = false;
  const candidates = new Set<string>();
  const visit = (node: ts.Node) => {
    if (used) return;
    if (
      ts.isBinaryExpression(node) &&
      ts.isElementAccessExpression(node.left) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    )
      used = true;
    if (
      ts.isCallExpression(node) &&
      /^(?:Object\.(?:assign|defineProperty|defineProperties)|Reflect\.set)$/.test(
        node.expression.getText(),
      )
    )
      used = true;
    if (
      ts.isIdentifier(node) &&
      candidates.has(node.text) &&
      !importedFrom(node, /./)
    ) {
      const declarations =
        checker.getSymbolAtLocation(node)?.declarations ?? [];
      for (const handle of declarations) {
        const declaration = handle.resolve();
        if (
          !declaration ||
          !importedFrom(declaration, /^@(?:kasperrt\/smolter|smolter)\//)
        )
          continue;
        const call = node.parent;
        const routes =
          ts.isCallExpression(call) && call.expression === node
            ? call.arguments[0]
            : undefined;
        const virtual =
          routes &&
          checker.getSymbolAtLocation(routes)?.declarations.some((item) => {
            const imported = item.resolve();
            return (
              imported && importedFrom(imported, /^virtual:smolter\/routes$/)
            );
          });
        if (!virtual) used = true;
      }
    }
    node.forEachChild(visit);
  };
  for (const source of sources) {
    if (source.text.includes("viewTransition")) return true;
    candidates.clear();
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !importedFrom(statement, /^@(?:kasperrt\/smolter|smolter)\//)
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) return true;
      for (const specifier of bindings && ts.isNamedImports(bindings)
        ? bindings.elements
        : [])
        if (factories.has((specifier.propertyName ?? specifier.name).text))
          candidates.add(specifier.name.text);
    }
    visit(source);
    if (used) return true;
  }
  return false;
}
