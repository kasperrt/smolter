import { existsSync, globSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { safeWrapAsync } from "@smolter/core";
import * as ts from "typescript/unstable/ast";
import {
  API,
  type Checker,
  SignatureKind,
  SymbolFlags,
  type Type,
  TypeFlags,
} from "typescript/unstable/sync";

export interface PrefetchCapabilities {
  intent: boolean;
  viewport: boolean;
  data: boolean;
}

const adapter =
  /^@(?:kasperrt\/smolter|smolter)\/(?:react|preact)(?:\/nested)?$/;
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

function isLink(node: ts.Node, checker: Checker, direct = false): boolean {
  const symbol = checker.getSymbolAtLocation(node);
  const declarations =
    symbol?.declarations.flatMap((handle) => {
      const node = handle.resolve();
      return node ? [node] : [];
    }) ?? [];
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
    if (
      namespace?.declarations.some((handle) => {
        const node = handle.resolve();
        return node ? adapterImport(node) : false;
      })
    )
      return true;
  }
  if (direct) return false;
  const type = checker.getTypeAtLocation(node);
  return Boolean(
    type &&
      checker
        .getSignaturesOfType(type, SignatureKind.Call)
        .some((signature) => {
          const declaration = signature.declaration?.resolve();
          return Boolean(
            declaration &&
              ts.isFunctionDeclaration(declaration) &&
              declaration.name &&
              linkNames.has(String(declaration.name.getText())) &&
              /\/(?:react|preact)\/(?:src\/)?navigation\.(?:d\.)?tsx?$/.test(
                declaration.getSourceFile().fileName,
              ),
          );
        }),
  );
}

function modes(type: Type | undefined): Set<string> {
  if (!type) return new Set(["intent", "viewport"]);
  if (type.isUnionType())
    return new Set(
      (type.getTypes() ?? []).flatMap((member) => [...modes(member)]),
    );
  if (type.isStringLiteralType()) return new Set([type.value]);
  if (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Void))
    return new Set(["intent"]);
  if (type.flags & TypeFlags.Never) return new Set();
  return new Set(["intent", "viewport"]);
}

function canBeTrue(type: Type | undefined): boolean {
  if (!type) return true;
  if (type.isUnionType()) return (type.getTypes() ?? []).some(canBeTrue);
  if (type.flags & (TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Never))
    return false;
  return (
    !(type.flags & TypeFlags.BooleanLiteral) ||
    (type.isBooleanLiteralType() && type.value === true)
  );
}

// Analyze source types, not transformed JSX. A union retains every possible mode;
// opaque types retain all capabilities instead of silently disabling behavior.
export async function analyzePrefetch(
  root: string,
  watch?: (file: string) => void,
): Promise<PrefetchCapabilities> {
  let directory = resolve(root);
  while (
    !existsSync(join(directory, "tsconfig.json")) &&
    dirname(directory) !== directory
  )
    directory = dirname(directory);
  const configPath = existsSync(join(directory, "tsconfig.json"))
    ? join(directory, "tsconfig.json")
    : undefined;
  if (configPath) watch?.(configPath);
  const roots = globSync("**/*.{ts,tsx,js,jsx,mts,mjs}", {
    cwd: root,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.generated/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/tests/**",
      "**/.git/**",
      "**/*.config.*",
    ],
  }).map((file) => resolve(root, file));
  if (!roots.length) return { intent: true, viewport: true, data: true };
  const virtualConfig = join(resolve(root), ".smolter-prefetch.json");
  const config = JSON.stringify({
    extends: configPath,
    files: roots,
    include: [],
    compilerOptions: {
      allowJs: true,
      noEmit: true,
      strictNullChecks: true,
      jsx: "preserve",
      moduleResolution: "bundler",
      module: "esnext",
    },
  });
  const api = new API({
    cwd: root,
    fs: {
      readFile: (file) => (file === virtualConfig ? config : undefined),
      fileExists: (file) => (file === virtualConfig ? true : undefined),
    },
  });
  const { data: result, error } = await safeWrapAsync(() => {
    const snapshot = api.updateSnapshot({ openProjects: [virtualConfig] });
    const project = snapshot.getProject(virtualConfig);
    if (!project)
      throw new Error("TypeScript did not open the prefetch analysis project");
    const { program, checker } = project;
    const diagnostic = program.getConfigFileParsingDiagnostics()[0];
    if (diagnostic) throw new Error(diagnostic.text);
    const result: PrefetchCapabilities = {
      intent: false,
      viewport: false,
      data: false,
    };
    const all = () => {
      result.intent = result.viewport = result.data = true;
    };
    const complete = () => result.intent && result.viewport && result.data;
    function props(node: ts.Node, attributes?: ts.JsxAttributes) {
      let selected = new Set(["intent"]);
      let data = false;
      const spread = (expression: ts.Node) => {
        const type = checker.getTypeAtLocation(expression);
        const alternatives = type?.isUnionType()
          ? (type.getTypes() ?? [])
          : [type];
        const combined = new Set<string>();
        let combinedData = false;
        for (const alternative of alternatives) {
          let branch = selected;
          let branchData = data;
          if (
            !alternative ||
            alternative.flags & (TypeFlags.Any | TypeFlags.Unknown) ||
            checker.getIndexInfosOfType(alternative).length
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
              const optional = Boolean(property.flags & SymbolFlags.Optional);
              if (name === "prefetch")
                branch = new Set([
                  ...(optional ? branch : []),
                  ...modes(value),
                ]);
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
    const sources = program
      .getSourceFileNames()
      .flatMap((file) => {
        const source = program.getSourceFile(file);
        return source ? [source] : [];
      })
      .filter((source) => {
        // HMR must still track every dependency before either pass can finish early.
        if (!source.fileName.includes("/node_modules/"))
          watch?.(source.fileName);
        return (
          !source.isDeclarationFile &&
          !/\/node_modules\/|\/(?:\.generated|dist|packages)\/(?:core|react|preact|client|server|vite)\//.test(
            source.fileName,
          )
        );
      });
    // Direct JSX imports often retain every capability without inferring unrelated
    // expressions. If they do not, the full pass still handles aliases and escapes.
    for (const direct of [true, false]) {
      if (complete()) break;
      const visit = (node: ts.Node) => {
        if (complete()) return;
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (isLink(node.tagName, checker, direct))
            props(node, node.attributes);
        }
        if (direct) {
          node.forEachChild(visit);
          return;
        }
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === "prefetch"
        ) {
          const type = checker.getTypeAtLocation(node);
          if (
            !type ||
            checker.getSignaturesOfType(type, SignatureKind.Call).length ||
            type.flags & TypeFlags.Any
          )
            result.data = true;
        }
        if (
          ts.isBindingElement(node) &&
          (node.propertyName ?? node.name)?.getText() === "prefetch"
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
          !ts.isPropertyAccessExpression(node.parent) &&
          !ts.isJsxOpeningElement(node.parent) &&
          !ts.isJsxClosingElement(node.parent) &&
          !ts.isJsxSelfClosingElement(node.parent) &&
          !(
            ts.isCallExpression(node.parent) &&
            node.parent.arguments[0] === node
          ) &&
          !adapterImport(node) &&
          isLink(node, checker)
        )
          all();
        node.forEachChild(visit);
      };
      for (const source of sources) {
        if (complete()) break;
        visit(source);
      }
    }
    return result;
  });
  api.close();
  if (!result) throw error;
  return result;
}
