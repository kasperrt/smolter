import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

type Range = [number, number];

const errors: string[] = [];
const sourceFile = /\.tsx?$/;
// Repository sources are TypeScript; plain JavaScript files are rejected outright.
const javascriptFile = /\.(?:[cm]?js|jsx)$/;
const suppressionComment = new RegExp(
  "(?:\\/\\/|\\/\\*)\\s*(?:@ts-(?:ignore|expect-error|nocheck)|biome-ignore)\\b",
);
const files: string[] = [];
function inNamedTypeDeclaration(node: ts.Node): boolean {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isInterfaceDeclaration(current) ||
      ts.isTypeAliasDeclaration(current)
    )
      return true;
    current = current.parent;
  }
  return false;
}
function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}
function hasEmptyObjectBranch(node: ts.Expression): boolean {
  const expr = unwrapExpression(node);
  if (!ts.isConditionalExpression(expr)) return false;
  for (const branch of [expr.whenTrue, expr.whenFalse]) {
    const inner = unwrapExpression(branch);
    if (ts.isObjectLiteralExpression(inner) && !inner.properties.length)
      return true;
    if (hasEmptyObjectBranch(inner)) return true;
  }
  return false;
}
function check(path: string) {
  const text = readFileSync(path, "utf8");
  const source = snapshot
    .getDefaultProjectForFile(resolve(path))
    ?.program.getSourceFile(resolve(path));
  if (!source) {
    errors.push(`${path}: not part of the TypeScript project.`);
    return;
  }
  const blocks: Range[] = [];
  const literals: Range[] = [];
  const report = (position: number, message: string) => {
    const { line } = source.getLineAndCharacterOfPosition(position);
    errors.push(`${path}:${line + 1}: ${message}`);
  };
  function visit(node: ts.Node) {
    if (ts.isTypeLiteralNode(node) && !inNamedTypeDeclaration(node))
      report(
        node.getStart(source),
        "Define object types as named interfaces or type aliases.",
      );
    if (ts.isSpreadAssignment(node) && hasEmptyObjectBranch(node.expression))
      report(
        node.getStart(source),
        "Use && shorthand spread instead of ternary with an empty object.",
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
    const insideLiteral = literals.some(
      ([start, end]) => position >= start && position < end,
    );
    if (
      !line.trim() &&
      blocks.some(([start, end]) => position > start && position < end) &&
      !insideLiteral
    )
      report(position, "Remove blank-line padding inside code blocks.");
    const suppression = !insideLiteral && suppressionComment.exec(line);
    if (suppression)
      report(
        position + suppression.index,
        "Fix the underlying type or lint issue instead of suppressing it.",
      );
    position += line.length;
  }
}
function scan(directory: string, recursive = true) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive && !["node_modules", "dist"].includes(entry.name))
        scan(path);
      continue;
    }
    if (javascriptFile.test(path))
      errors.push(
        `${path}: write TypeScript (.ts/.tsx) instead of JavaScript.`,
      );
    if (sourceFile.test(path)) files.push(path);
  }
}
scan(".", false);
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
