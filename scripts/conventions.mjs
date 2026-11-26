import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

const errors = [];
const sourceFile = /\.(?:tsx?|m?js)$/;
const files = readdirSync(".", { withFileTypes: true })
  .filter((entry) => entry.isFile() && sourceFile.test(entry.name))
  .map((entry) => entry.name);
// Object types nested in intersections, unions or generic arguments belong to the
// signature or assertion that contains them.
function typeOwner(node) {
  let current = node;
  while (
    ts.isIntersectionTypeNode(current.parent) ||
    ts.isUnionTypeNode(current.parent) ||
    ts.isParenthesizedTypeNode(current.parent) ||
    ts.isArrayTypeNode(current.parent) ||
    ts.isTypeReferenceNode(current.parent)
  )
    current = current.parent;
  return current;
}
function check(path) {
  const text = readFileSync(path, "utf8");
  const source = snapshot
    .getDefaultProjectForFile(resolve(path))
    .program.getSourceFile(resolve(path));
  const blocks = [];
  const literals = [];
  const report = (position, message) => {
    const { line } = source.getLineAndCharacterOfPosition(position);
    errors.push(`${path}:${line + 1}: ${message}`);
  };
  function visit(node) {
    const owner = ts.isTypeLiteralNode(node) && typeOwner(node);
    if (
      owner &&
      (ts.isParameterDeclaration(owner.parent) ||
        ((ts.isFunctionLikeDeclaration(owner.parent) ||
          ts.isFunctionTypeNode(owner.parent)) &&
          owner.parent.type === owner))
    )
      report(
        node.getStart(source),
        "Name object types used in function signatures.",
      );
    if (
      owner &&
      (ts.isAsExpression(owner.parent) ||
        ts.isTypeAssertion(owner.parent) ||
        ts.isSatisfiesExpression(owner.parent))
    )
      report(
        node.getStart(source),
        "Name object types used in type assertions.",
      );
    if (ts.isIfStatement(node) && node.elseStatement)
      report(
        node.elseStatement.getStart(source),
        "Use a guard or early return instead of else.",
      );
    if (ts.isTryStatement(node))
      report(
        node.getStart(source),
        "Use safeWrapAsync instead of try/catch/finally.",
      );
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      report(node.getStart(source), "Use an explicit type instead of any.");
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["then", "catch", "finally"].includes(node.expression.name.text)
    )
      report(
        node.getStart(source),
        "Use async/await and safeWrapAsync instead of promise chains.",
      );
    if (ts.isBlock(node)) blocks.push([node.getStart(source), node.end]);
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isRegularExpressionLiteral(node)
    )
      literals.push([node.getStart(source), node.end]);
    node.forEachChild(visit);
  }
  visit(source);
  let position = 0;
  for (const line of text.split(/(?<=\n)/)) {
    if (
      !line.trim() &&
      blocks.some(([start, end]) => position > start && position < end) &&
      !literals.some(([start, end]) => position >= start && position < end)
    )
      report(position, "Remove blank-line padding inside code blocks.");
    position += line.length;
  }
}
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist"].includes(entry.name)) scan(path);
      continue;
    }
    if (sourceFile.test(path)) files.push(path);
  }
}
for (const directory of ["packages", "apps", "scripts", "tooling"])
  scan(directory);
const api = new API({ cwd: process.cwd() });
const snapshot = api.updateSnapshot({
  openFiles: files.map((file) => resolve(file)),
});
for (const file of files) check(file);
api.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
