import { dirname, resolve } from "node:path";
import ts from "typescript";

export interface PrefetchCapabilities {
  intent: boolean;
  viewport: boolean;
  data: boolean;
}

const adapter = /^@(?:kasperrt\/smolter|smolter)\/(?:react|preact)$/;
const linkNames = new Set(["Link", "NavLink"]);

function adapterImport(node: ts.Node): boolean {
  for (
    let current: ts.Node | undefined = node;
    current;
    current = current.parent
  ) {
    if (ts.isImportDeclaration(current))
      return (
        ts.isStringLiteral(current.moduleSpecifier) &&
        adapter.test(current.moduleSpecifier.text)
      );
  }
  return false;
}

function isLink(node: ts.Node, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(node);
  const declarations = symbol?.declarations ?? [];
  if (
    declarations.some(
      (declaration) =>
        ts.isImportSpecifier(declaration) &&
        linkNames.has((declaration.propertyName ?? declaration.name).text) &&
        adapterImport(declaration),
    )
  )
    return true;
  if (ts.isPropertyAccessExpression(node) && linkNames.has(node.name.text)) {
    const namespace = checker.getSymbolAtLocation(node.expression);
    if (namespace?.declarations?.some(adapterImport)) return true;
  }
  return checker
    .getTypeAtLocation(node)
    .getCallSignatures()
    .some((signature) => {
      const declaration = signature.getDeclaration();
      return Boolean(
        declaration?.name &&
          linkNames.has(declaration.name.getText()) &&
          /\/(?:react|preact)\/(?:src\/)?navigation\.(?:d\.)?tsx?$/.test(
            declaration.getSourceFile().fileName,
          ),
      );
    });
}

function modes(type: ts.Type): Set<string> {
  if (type.isUnion())
    return new Set(type.types.flatMap((member) => [...modes(member)]));
  if (type.isStringLiteral()) return new Set([type.value]);
  if (
    type.flags &
    (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void)
  )
    return new Set(["intent"]);
  if (type.flags & ts.TypeFlags.Never) return new Set();
  return new Set(["intent", "viewport"]);
}

function canBeTrue(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.some(canBeTrue);
  if (
    type.flags &
    (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Never)
  )
    return false;
  return (
    !(type.flags & ts.TypeFlags.BooleanLiteral) ||
    (type as ts.Type & { intrinsicName: string }).intrinsicName === "true"
  );
}

// Analyze source types, not transformed JSX. A union retains every possible mode;
// opaque types retain all capabilities instead of silently disabling behavior.
export function analyzePrefetch(
  root: string,
  watch?: (file: string) => void,
): PrefetchCapabilities {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists);
  if (configPath) watch?.(configPath);
  const config = configPath && ts.readConfigFile(configPath, ts.sys.readFile);
  if (config && config.error)
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  const parsed = ts.parseJsonConfigFileContent(
    config ? config.config : {},
    ts.sys,
    configPath ? dirname(configPath) : root,
  );
  const roots = ts.sys.readDirectory(
    root,
    [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"],
    [
      "**/node_modules/**",
      "**/dist/**",
      "**/.generated/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/tests/**",
      "**/.git/**",
      "**/*.config.*",
    ],
    ["**/*"],
  );
  if (!roots.length) return { intent: true, viewport: true, data: true };
  const program = ts.createProgram(
    roots.map((file) => resolve(file)),
    {
      ...parsed.options,
      allowJs: true,
      noEmit: true,
      strictNullChecks: true,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
    },
  );
  const checker = program.getTypeChecker();
  const result: PrefetchCapabilities = {
    intent: false,
    viewport: false,
    data: false,
  };
  const all = () => {
    result.intent = result.viewport = result.data = true;
  };

  function props(node: ts.Node, attributes?: ts.JsxAttributes) {
    let selected = new Set(["intent"]);
    let data = false;
    const spread = (expression: ts.Node) => {
      const type = checker.getTypeAtLocation(expression);
      const alternatives = type.isUnion() ? type.types : [type];
      const combined = new Set<string>();
      let combinedData = false;
      for (const alternative of alternatives) {
        let branch = selected;
        let branchData = data;
        if (
          alternative.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) ||
          alternative.getStringIndexType()
        ) {
          branch = new Set(["intent", "viewport"]);
          branchData = true;
        } else
          for (const name of ["prefetch", "prefetchData"]) {
            const property = checker.getPropertyOfType(alternative, name);
            if (!property) continue;
            const value = checker.getTypeOfSymbolAtLocation(
              property,
              expression,
            );
            const optional = Boolean(property.flags & ts.SymbolFlags.Optional);
            if (name === "prefetch")
              branch = new Set([...(optional ? branch : []), ...modes(value)]);
            else branchData = (optional && branchData) || canBeTrue(value);
          }
        for (const mode of branch) combined.add(mode);
        combinedData ||= branchData;
      }
      selected = combined;
      data = combinedData;
    };
    if (!attributes) spread(node);
    else
      for (const attribute of attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          spread(attribute.expression);
          continue;
        }
        const name = attribute.name.getText();
        if (name !== "prefetch" && name !== "prefetchData") continue;
        const initializer = attribute.initializer;
        const expression =
          initializer &&
          (ts.isJsxExpression(initializer)
            ? initializer.expression
            : initializer);
        if (name === "prefetch")
          selected = expression
            ? ts.isStringLiteral(expression)
              ? new Set([expression.text])
              : modes(checker.getTypeAtLocation(expression))
            : new Set(["intent", "viewport"]);
        else
          data =
            !expression ||
            (expression.kind !== ts.SyntaxKind.FalseKeyword &&
              canBeTrue(checker.getTypeAtLocation(expression)));
      }
    result.intent ||= selected.has("intent");
    result.viewport ||= selected.has("viewport");
    result.data ||=
      data && (selected.has("intent") || selected.has("viewport"));
  }

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.includes("/node_modules/")) watch?.(source.fileName);
    if (
      source.isDeclarationFile ||
      /\/node_modules\/|\/(?:\.generated|dist|packages)\/(?:core|react|preact|client|server|vite)\//.test(
        source.fileName,
      )
    )
      continue;
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (isLink(node.tagName, checker)) props(node, node.attributes);
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "prefetch"
      ) {
        const type = checker.getTypeAtLocation(node);
        if (type.getCallSignatures().length || type.flags & ts.TypeFlags.Any)
          result.data = true;
      }
      if (
        ts.isBindingElement(node) &&
        (node.propertyName ?? node.name).getText() === "prefetch"
      )
        result.data = true;
      if (ts.isCallExpression(node)) {
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "prefetch"
        )
          result.data = true;
        if (node.arguments[0] && isLink(node.arguments[0], checker)) {
          if (node.arguments[1]) props(node.arguments[1]);
          else result.intent = true;
        }
      }
      // Passing Link as an uninspectable value (for example a component prop)
      // keeps all capabilities. Ordinary JSX tags and createElement are handled above.
      if (
        ts.isIdentifier(node) &&
        isLink(node, checker) &&
        !adapterImport(node) &&
        !ts.isPropertyAccessExpression(node.parent) &&
        !ts.isJsxOpeningElement(node.parent) &&
        !ts.isJsxClosingElement(node.parent) &&
        !ts.isJsxSelfClosingElement(node.parent) &&
        !(ts.isCallExpression(node.parent) && node.parent.arguments[0] === node)
      )
        all();
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return result;
}
