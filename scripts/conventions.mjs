import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript-compiler";

const errors = [];
function check(path) {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const blocks = [];
  const literals = [];
  const report = (position, message) => {
    const { line } = source.getLineAndCharacterOfPosition(position);
    errors.push(`${path}:${line + 1}: ${message}`);
  };
  function visit(node) {
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
      ts.isStringLiteralLike(node) ||
      ts.isTemplateExpression(node) ||
      ts.isRegularExpressionLiteral(node)
    )
      literals.push([node.getStart(source), node.end]);
    ts.forEachChild(node, visit);
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
    } else if (/\.(?:tsx?|m?js)$/.test(path)) check(path);
  }
}
for (const directory of ["packages", "apps", "tests", "scripts", "tooling"])
  scan(directory);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
