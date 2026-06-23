import type { ZipTextFile } from "./browserZip";
import type { JsTsModuleMap } from "./types";
import { countSideEffects } from "./analysisSummary";
import { extractBehaviorBindings } from "./jsTsBehaviorBindings";
export { confidenceRankForBehaviorBinding, dedupeBehaviorBindings } from "./jsTsBehaviorBindings";
import { dirname, isScriptPath, joinProjectPath, normalizeAssetPath } from "./scannerUtils";

export async function buildJsTsModuleMap(files: ZipTextFile[], projectPaths: string[]): Promise<JsTsModuleMap> {
  const ts = await import("typescript");
  const allPaths = new Set(projectPaths.map(normalizeAssetPath));
  const scriptFiles = files.filter((file) => isScriptPath(file.path));
  const moduleFiles = scriptFiles.map((file) => analyzeJsTsModule(file, allPaths, ts));
  const unresolvedImports = moduleFiles.flatMap((file) =>
    file.unresolvedImports.map((importPath) => ({
      sourceFile: file.path,
      importPath,
    })),
  );
  const resolvedImports = moduleFiles.flatMap((file) =>
    file.resolvedImports.map((resolvedImport) => ({
      sourceFile: file.path,
      ...resolvedImport,
    })),
  );
  const behaviorBindings = moduleFiles.flatMap((file) => file.behaviorBindings);

  return {
    files: moduleFiles.sort((a, b) => b.unresolvedImports.length - a.unresolvedImports.length || b.sideEffects - a.sideEffects || a.path.localeCompare(b.path)),
    totalImports: moduleFiles.reduce((total, file) => total + file.imports, 0),
    totalExports: moduleFiles.reduce((total, file) => total + file.exports, 0),
    behaviorBindings,
    unresolvedImports,
    resolvedImports,
  };
}

function analyzeJsTsModule(file: ZipTextFile, allPaths: Set<string>, ts: typeof import("typescript")) {
  const path = normalizeAssetPath(file.path);
  const sourceFile = ts.createSourceFile(path, file.text, ts.ScriptTarget.Latest, true, scriptKindForPath(path, ts));
  const importPaths: string[] = [];
  let exportCount = 0;

  function visit(node: import("typescript").Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      importPaths.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) importPaths.push(node.moduleSpecifier.text);
      exportCount += node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.length : 1;
    }
    if (ts.isExportAssignment(node)) exportCount += 1;
    if (hasExportModifier(node, ts)) {
      if (ts.isVariableStatement(node)) exportCount += node.declarationList.declarations.length;
      else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
        exportCount += 1;
      }
    }
    if (ts.isCallExpression(node)) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteral(firstArg)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) importPaths.push(firstArg.text);
        if (ts.isIdentifier(node.expression) && node.expression.text === "require") importPaths.push(firstArg.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  const sideEffects = countSideEffects(file.text);
  const localImports = [...new Set(importPaths.filter((importPath) => shouldCheckReference(importPath, path)))].sort();
  const resolvedImports = localImports.flatMap((importPath) => {
    const resolvedPath = resolveJsTsModuleReference(path, importPath, allPaths);
    return resolvedPath ? [{ importPath, resolvedPath }] : [];
  });
  const resolvedImportPaths = new Set(resolvedImports.map((resolvedImport) => resolvedImport.importPath));
  const unresolvedImports = localImports
    .filter((importPath) => shouldCheckReference(importPath, path))
    .filter((importPath) => !resolvedImportPaths.has(importPath));

  return {
    path,
    imports: importPaths.length,
    exports: exportCount,
    sideEffects: Object.values(sideEffects).reduce((total, count) => total + count, 0),
    behaviorBindings: extractBehaviorBindings(path, sourceFile, ts),
    resolvedImports,
    unresolvedImports,
  };
}

export function resolveJsTsModuleReference(fromPath: string, rawReference: string, allPaths: Set<string>): string | null {
  const reference = rawReference.trim();
  if (!reference || (!reference.startsWith(".") && !reference.startsWith("/"))) return null;

  const cleanReference = normalizeAssetPath(reference.split(/[?#]/)[0] ?? "");
  if (!cleanReference) return null;

  const basePath = reference.startsWith("/") ? cleanReference : joinProjectPath(dirname(fromPath), cleanReference);
  return jsTsModuleCandidates(basePath).find((candidate) => allPaths.has(candidate)) ?? null;
}

function jsTsModuleCandidates(path: string): string[] {
  const normalized = normalizeAssetPath(path);
  const candidates = [normalized];
  const moduleExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json"];

  if (!/\.[a-z0-9]+$/i.test(normalized)) {
    candidates.push(...moduleExtensions.map((extension) => `${normalized}${extension}`));
    candidates.push(...moduleExtensions.map((extension) => `${normalized}/index${extension}`));
  }

  return [...new Set(candidates)];
}

function scriptKindForPath(path: string, ts: typeof import("typescript")) {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lowerPath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lowerPath.endsWith(".ts") || lowerPath.endsWith(".mts") || lowerPath.endsWith(".cts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function hasExportModifier(node: import("typescript").Node, ts: typeof import("typescript")): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function shouldCheckReference(rawReference: string, fromPath: string): boolean {
  const reference = rawReference.trim();
  if (!reference || reference.startsWith("#") || /^(https?:)?\/\//i.test(reference) || /^(data|mailto|tel|javascript|blob):/i.test(reference)) {
    return false;
  }
  if (isScriptPath(fromPath) && !reference.startsWith(".") && !reference.startsWith("/")) return false;

  const cleanReference = reference.split(/[?#]/)[0] ?? "";
  if (!cleanReference) return false;
  if (!/\.[a-z0-9]+$/i.test(cleanReference) && !reference.startsWith(".") && !reference.startsWith("/")) return false;
  return true;
}
