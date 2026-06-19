import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, JsTsModuleMap } from "./types";
import { countSideEffects } from "./analysisSummary";
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

    if (ts.isExportAssignment(node)) {
      exportCount += 1;
    }

    if (hasExportModifier(node, ts)) {
      if (ts.isVariableStatement(node)) exportCount += node.declarationList.declarations.length;
      else if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)
      ) {
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

function extractBehaviorBindings(
  path: string,
  sourceFile: import("typescript").SourceFile,
  ts: typeof import("typescript"),
): BehaviorBinding[] {
  const selectorByName = new Map<string, string>();
  const handlerByName = new Map<string, import("typescript").Node>();
  const bindings: BehaviorBinding[] = [];

  function collect(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const selector = selectorFromExpression(node.initializer, selectorByName, ts);
      if (selector) selectorByName.set(node.name.text, selector);

      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        handlerByName.set(node.name.text, node.initializer);
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      handlerByName.set(node.name.text, node);
    }

    ts.forEachChild(node, collect);
  }

  function visit(node: import("typescript").Node) {
    if (ts.isCallExpression(node)) {
      const forEachBindings = behaviorBindingsFromForEachCall(path, sourceFile, node, selectorByName, handlerByName, ts);
      bindings.push(...forEachBindings);

      const eventBinding = behaviorBindingFromCall(path, sourceFile, node, selectorByName, handlerByName, ts);
      if (eventBinding) bindings.push(eventBinding);

      const mutationBinding = mutationBindingFromCall(path, sourceFile, node, selectorByName, ts);
      if (mutationBinding) bindings.push(mutationBinding);

      const delegatedBindings = delegatedBehaviorBindingsFromCall(path, sourceFile, node, selectorByName, handlerByName, ts);
      bindings.push(...delegatedBindings);
    }

    if (ts.isBinaryExpression(node)) {
      const assignmentBinding = behaviorBindingFromAssignment(path, sourceFile, node, selectorByName, handlerByName, ts);
      if (assignmentBinding) bindings.push(assignmentBinding);
    }

    ts.forEachChild(node, visit);
  }

  collect(sourceFile);
  visit(sourceFile);
  return dedupeBehaviorBindings(bindings)
    .sort((a, b) => confidenceRankForBehaviorBinding(a.confidence) - confidenceRankForBehaviorBinding(b.confidence) || a.sourceFile.localeCompare(b.sourceFile) || a.line - b.line)
    .slice(0, 200);
}

function behaviorBindingFromCall(
  sourcePath: string,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").CallExpression,
  selectorByName: Map<string, string>,
  handlerByName: Map<string, import("typescript").Node>,
  ts: typeof import("typescript"),
): BehaviorBinding | null {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "addEventListener") return null;

  const selector = selectorFromExpression(node.expression.expression, selectorByName, ts);
  const event = stringValue(node.arguments[0], ts);
  if (!selector || !event) return null;

  const handlerArg = node.arguments[1];
  const handler = handlerLabel(handlerArg, ts);
  const handlerNode = handlerArg && ts.isIdentifier(handlerArg) ? handlerByName.get(handlerArg.text) : handlerArg;
  const summary = summarizeBehaviorEffects(handlerNode ?? node, selectorByName, ts);
  if (isGlobalEventTarget(selector) && delegatedSelectorsFromNode(handlerNode ?? node, ts).length > 0) return null;

  return {
    sourceFile: sourcePath,
    selector,
    kind: "event",
    event,
    handler,
    effects: bindingEffectsForEvent(event, summary.effects),
    targets: summary.targets,
    endpoints: summary.endpoints,
    line: lineNumberForNode(sourceFile, node),
    confidence: behaviorBindingConfidence(selector, event, summary.effects, summary.targets),
  };
}

function behaviorBindingsFromForEachCall(
  sourcePath: string,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").CallExpression,
  selectorByName: Map<string, string>,
  handlerByName: Map<string, import("typescript").Node>,
  ts: typeof import("typescript"),
): BehaviorBinding[] {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "forEach") return [];

  const collectionSelector = selectorFromExpression(node.expression.expression, selectorByName, ts);
  const callback = node.arguments[0];
  if (!collectionSelector || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) return [];
  const itemSelector = collectionSelector;

  const itemParam = callback.parameters[0]?.name;
  if (!itemParam || !ts.isIdentifier(itemParam)) return [];

  const localSelectors = new Map(selectorByName);
  localSelectors.set(itemParam.text, itemSelector);
  const bindings: BehaviorBinding[] = [];

  function visit(current: import("typescript").Node) {
    if (ts.isCallExpression(current)) {
      const eventBinding = behaviorBindingFromCall(sourcePath, sourceFile, current, localSelectors, handlerByName, ts);
      if (eventBinding) bindings.push({ ...eventBinding, selector: itemSelector });

      const mutationBinding = mutationBindingFromCall(sourcePath, sourceFile, current, localSelectors, ts);
      if (mutationBinding) bindings.push({ ...mutationBinding, selector: itemSelector });
    }

    if (ts.isBinaryExpression(current)) {
      const assignmentBinding = behaviorBindingFromAssignment(sourcePath, sourceFile, current, localSelectors, handlerByName, ts);
      if (assignmentBinding) bindings.push({ ...assignmentBinding, selector: itemSelector });
    }

    ts.forEachChild(current, visit);
  }

  visit(callback.body);
  return bindings;
}

function delegatedBehaviorBindingsFromCall(
  sourcePath: string,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").CallExpression,
  selectorByName: Map<string, string>,
  handlerByName: Map<string, import("typescript").Node>,
  ts: typeof import("typescript"),
): BehaviorBinding[] {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "addEventListener") return [];

  const selector = selectorFromExpression(node.expression.expression, selectorByName, ts);
  const event = stringValue(node.arguments[0], ts);
  const handlerArg = node.arguments[1];
  const handlerNode = handlerArg && ts.isIdentifier(handlerArg) ? handlerByName.get(handlerArg.text) : handlerArg;
  if (!selector || !event || !handlerNode || !isGlobalEventTarget(selector)) return [];

  const delegatedSelectors = delegatedSelectorsFromNode(handlerNode, ts);
  if (!delegatedSelectors.length) return [];

  const summary = summarizeBehaviorEffects(handlerNode, selectorByName, ts);
  return delegatedSelectors.map((delegatedSelector) => ({
    sourceFile: sourcePath,
    selector: delegatedSelector,
    kind: "delegated-event" as const,
    event,
    handler: handlerLabel(handlerArg, ts),
    effects: [...new Set([...bindingEffectsForEvent(event, summary.effects), "delegated event"])].sort(),
    targets: summary.targets,
    endpoints: summary.endpoints,
    line: lineNumberForNode(sourceFile, node),
    confidence: behaviorBindingConfidence(delegatedSelector, event, summary.effects, summary.targets),
  }));
}

function mutationBindingFromCall(
  sourcePath: string,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").CallExpression,
  selectorByName: Map<string, string>,
  ts: typeof import("typescript"),
): BehaviorBinding | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;

  const method = node.expression.name.text;
  const mutationMethods = new Set(["appendChild", "removeChild", "replaceChildren", "setAttribute", "removeAttribute", "insertAdjacentHTML", "insertAdjacentElement", "before", "after"]);
  const classListMethods = new Set(["add", "remove", "toggle", "replace"]);
  let selector = selectorFromExpression(node.expression.expression, selectorByName, ts);
  let effect: string | null = ["insertAdjacentHTML"].includes(method) ? "DOM content update" : mutationMethods.has(method) ? "DOM tree mutation" : null;

  if (!selector && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === "classList") {
    selector = selectorFromExpression(node.expression.expression.expression, selectorByName, ts);
    if (classListMethods.has(method)) effect = "class state change";
  }

  if (!selector || !effect) return null;

  return {
    sourceFile: sourcePath,
    selector,
    kind: "direct-mutation",
    event: "direct mutation",
    handler: method,
    effects: [effect],
    targets: mutationTargets(selector, method, node.arguments, ts),
    endpoints: [],
    line: lineNumberForNode(sourceFile, node),
    confidence: "Review",
  };
}

function behaviorBindingFromAssignment(
  sourcePath: string,
  sourceFile: import("typescript").SourceFile,
  node: import("typescript").BinaryExpression,
  selectorByName: Map<string, string>,
  handlerByName: Map<string, import("typescript").Node>,
  ts: typeof import("typescript"),
): BehaviorBinding | null {
  if (!ts.isPropertyAccessExpression(node.left)) return null;

  const property = node.left.name.text;
  const selector = selectorFromExpression(node.left.expression, selectorByName, ts);
  if (!selector) return null;

  if (property.startsWith("on")) {
    const event = property.slice(2) || "event";
    const handler = handlerLabel(node.right, ts);
    const handlerNode = ts.isIdentifier(node.right) ? handlerByName.get(node.right.text) : node.right;
    const summary = summarizeBehaviorEffects(handlerNode ?? node.right, selectorByName, ts);

    return {
      sourceFile: sourcePath,
      selector,
      kind: "event",
      event,
      handler,
      effects: bindingEffectsForEvent(event, summary.effects),
      targets: summary.targets,
      endpoints: summary.endpoints,
      line: lineNumberForNode(sourceFile, node),
      confidence: behaviorBindingConfidence(selector, event, summary.effects, summary.targets),
    };
  }

  const domUpdateProperties = new Set(["innerHTML", "textContent", "innerText", "value", "src", "href", "disabled", "checked"]);
  if (!domUpdateProperties.has(property) && property !== "className") return null;

  return {
    sourceFile: sourcePath,
    selector,
    kind: property === "className" ? "direct-mutation" : "render-update",
    event: "direct assignment",
    handler: property,
    effects: [property === "className" ? "class state change" : "DOM content update"],
    targets: [`${selector} ${property}`],
    endpoints: [],
    line: lineNumberForNode(sourceFile, node),
    confidence: "Review",
  };
}

function summarizeBehaviorEffects(
  node: import("typescript").Node,
  selectorByName: Map<string, string>,
  ts: typeof import("typescript"),
) {
  const effects = new Set<string>();
  const targets = new Set<string>();
  const endpoints = new Set<string>();

  function visit(current: import("typescript").Node) {
    if (ts.isCallExpression(current)) {
      const expression = current.expression;
      if (ts.isIdentifier(expression) && expression.text === "fetch") {
        effects.add("network request");
        const endpoint = endpointFromFetchCall(current, ts);
        if (endpoint) endpoints.add(endpoint);
      }

      if (ts.isPropertyAccessExpression(expression)) {
        const method = expression.name.text;
        const selector = selectorFromDomCall(current, ts);
        if (selector) targets.add(selector);

        if (method === "preventDefault") effects.add("form/event handling");
        if (["add", "remove", "toggle", "replace"].includes(method) && ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "classList") {
          effects.add("class state change");
          const classTargetSelector = selectorFromExpression(expression.expression.expression, selectorByName, ts);
          for (const target of mutationTargets(classTargetSelector ?? "classList target", method, current.arguments, ts)) targets.add(target);
        }
        if (["appendChild", "removeChild", "replaceChildren", "insertAdjacentElement", "before", "after"].includes(method)) effects.add("DOM tree mutation");
        if (method === "insertAdjacentHTML") effects.add("DOM content update");
        if (["setAttribute", "removeAttribute"].includes(method)) effects.add("attribute update");
        if (["pushState", "replaceState"].includes(method)) effects.add("navigation/history");
        if (["setItem", "removeItem", "clear"].includes(method)) effects.add("browser storage");
        if (method === "open") {
          const endpoint = endpointFromXhrOpenCall(current, ts);
          if (endpoint) {
            effects.add("network request");
            endpoints.add(endpoint);
          }
        }
      }
    }

    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "XMLHttpRequest") {
      effects.add("network request");
    }

    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "FormData") {
      effects.add("form data");
    }

    if (ts.isBinaryExpression(current) && ts.isPropertyAccessExpression(current.left)) {
      const property = current.left.name.text;
      if (["innerHTML", "textContent", "innerText", "value"].includes(property)) effects.add("DOM content update");
      if (property === "className") effects.add("class state change");
      if (property === "location" || property === "href") effects.add("navigation/history");
    }

    if (ts.isPropertyAccessExpression(current)) {
      const text = current.getText();
      if (/\b(localStorage|sessionStorage)\b/.test(text)) effects.add("browser storage");
      if (/\blocation\b/.test(text)) effects.add("navigation/history");
      if (/\.style\b/.test(text)) effects.add("inline style update");
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return {
    effects: [...effects].sort(),
    targets: [...targets].sort(),
    endpoints: [...endpoints].sort(),
  };
}

function selectorFromExpression(
  expression: import("typescript").Expression,
  selectorByName: Map<string, string>,
  ts: typeof import("typescript"),
): string | null {
  if (ts.isIdentifier(expression)) {
    if (expression.text === "document" || expression.text === "window") return expression.text;
    return selectorByName.get(expression.text) ?? null;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    if (expression.getText() === "document.body") return "body";
    if (expression.getText() === "document.documentElement") return "html";
  }

  if (ts.isCallExpression(expression)) {
    if (ts.isPropertyAccessExpression(expression.expression) && expression.expression.name.text === "from") {
      return selectorFromExpression(expression.arguments[0], selectorByName, ts);
    }

    return selectorFromDomCall(expression, ts);
  }

  return null;
}

function selectorFromDomCall(node: import("typescript").CallExpression, ts: typeof import("typescript")): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;

  const method = node.expression.name.text;
  const value = stringValue(node.arguments[0], ts);
  if (!value) return null;

  if (method === "querySelector" || method === "querySelectorAll" || method === "closest") return value;
  if (method === "getElementById") return `#${value}`;
  if (method === "getElementsByClassName") return `.${value}`;

  return null;
}

function mutationTargets(
  selector: string,
  method: string,
  args: import("typescript").NodeArray<import("typescript").Expression>,
  ts: typeof import("typescript"),
): string[] {
  const classNames = [...args]
    .map((arg) => stringValue(arg, ts))
    .filter((value): value is string => Boolean(value))
    .filter((value) => /^[A-Za-z_-][\w-]*$/.test(value));

  if (["add", "remove", "toggle", "replace"].includes(method) && classNames.length) {
    return classNames.map((className) => `${selector}.${className}`);
  }

  if (["setAttribute", "removeAttribute"].includes(method)) {
    const attribute = stringValue(args[0], ts);
    return attribute ? [`${selector} [${attribute}]`] : [selector];
  }

  if (method === "insertAdjacentHTML") return [`${selector} html`];
  return [selector];
}

function endpointFromFetchCall(node: import("typescript").CallExpression, ts: typeof import("typescript")): string | null {
  const url = endpointUrlFromExpression(node.arguments[0], ts);
  if (!url) return null;

  const init = node.arguments[1];
  const method = init && ts.isObjectLiteralExpression(init) ? objectStringProperty(init, "method", ts) : null;
  return method ? `${method.toUpperCase()} ${url}` : `GET ${url}`;
}

function endpointFromXhrOpenCall(node: import("typescript").CallExpression, ts: typeof import("typescript")): string | null {
  const method = stringValue(node.arguments[0], ts);
  const url = endpointUrlFromExpression(node.arguments[1], ts);
  if (!url) return null;
  return method ? `${method.toUpperCase()} ${url}` : url;
}

function endpointUrlFromExpression(node: import("typescript").Node | undefined, ts: typeof import("typescript")): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Request") {
    return endpointUrlFromExpression(node.arguments?.[0], ts);
  }
  return null;
}

function objectStringProperty(objectLiteral: import("typescript").ObjectLiteralExpression, name: string, ts: typeof import("typescript")): string | null {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
    if (propertyName !== name) continue;
    return stringValue(property.initializer, ts);
  }

  return null;
}

function delegatedSelectorsFromNode(node: import("typescript").Node, ts: typeof import("typescript")): string[] {
  const selectors = new Set<string>();

  function visit(current: import("typescript").Node) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
      const method = current.expression.name.text;
      const value = stringValue(current.arguments[0], ts);

      if (value && (method === "matches" || method === "closest")) selectors.add(value);
      if (value && method === "contains" && ts.isPropertyAccessExpression(current.expression.expression) && current.expression.expression.name.text === "classList") {
        selectors.add(`.${value}`);
      }
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return [...selectors].sort();
}

function isGlobalEventTarget(selector: string): boolean {
  return selector === "document" || selector === "window" || selector === "body" || selector === "html";
}

function stringValue(node: import("typescript").Node | undefined, ts: typeof import("typescript")): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function handlerLabel(node: import("typescript").Node | undefined, ts: typeof import("typescript")): string {
  if (!node) return "inline handler";
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "inline handler";
  return "handler expression";
}

function bindingEffectsForEvent(event: string, effects: string[]): string[] {
  const nextEffects = new Set(effects);
  if (event === "submit") nextEffects.add("form/event handling");
  if (event === "input" || event === "change") nextEffects.add("input state change");
  return [...nextEffects].sort();
}

function behaviorBindingConfidence(selector: string, event: string, effects: string[], targets: string[]): BehaviorBinding["confidence"] {
  if ((selector.startsWith(".") || selector.startsWith("#")) && event !== "event" && effects.length > 0) return "High";
  if (event !== "event" && (effects.length > 0 || targets.length > 0)) return "Medium";
  return "Review";
}

export function confidenceRankForBehaviorBinding(confidence: BehaviorBinding["confidence"]): number {
  if (confidence === "High") return 0;
  if (confidence === "Medium") return 1;
  return 2;
}

export function dedupeBehaviorBindings(bindings: BehaviorBinding[]): BehaviorBinding[] {
  const byKey = new Map<string, BehaviorBinding>();

  for (const binding of bindings) {
    const key = `${binding.sourceFile}:${binding.selector}:${binding.event}:${binding.line}`;
    const existing = byKey.get(key);
    if (!existing || confidenceRankForBehaviorBinding(binding.confidence) < confidenceRankForBehaviorBinding(existing.confidence)) {
      byKey.set(key, binding);
    }
  }

  return [...byKey.values()];
}

function lineNumberForNode(sourceFile: import("typescript").SourceFile, node: import("typescript").Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
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

  if (
    !reference ||
    reference.startsWith("#") ||
    /^(https?:)?\/\//i.test(reference) ||
    /^(data|mailto|tel|javascript|blob):/i.test(reference)
  ) {
    return false;
  }

  if (isScriptPath(fromPath) && !reference.startsWith(".") && !reference.startsWith("/")) {
    return false;
  }

  const cleanReference = reference.split(/[?#]/)[0] ?? "";
  if (!cleanReference) return false;

  if (!/.[a-z0-9]+$/i.test(cleanReference) && !reference.startsWith(".") && !reference.startsWith("/")) {
    return false;
  }

  return true;
}
