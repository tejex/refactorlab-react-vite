import type { BehaviorBinding } from "./types";
import {
  behaviorBindingConfidence,
  bindingEffectsForEvent,
  delegatedSelectorsFromNode,
  handlerLabel,
  isGlobalEventTarget,
  lineNumberForNode,
  mutationTargets,
  selectorFromExpression,
  stringValue,
  summarizeBehaviorEffects,
} from "./jsTsBehaviorEffects";

type TsApi = typeof import("typescript");

export function extractBehaviorBindings(
  path: string,
  sourceFile: import("typescript").SourceFile,
  ts: TsApi,
): BehaviorBinding[] {
  const selectorByName = new Map<string, string>();
  const handlerByName = new Map<string, import("typescript").Node>();
  const bindings: BehaviorBinding[] = [];

  function collect(node: import("typescript").Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const selector = selectorFromExpression(node.initializer, selectorByName, ts);
      if (selector) selectorByName.set(node.name.text, selector);
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) handlerByName.set(node.name.text, node.initializer);
    }
    if (ts.isFunctionDeclaration(node) && node.name) handlerByName.set(node.name.text, node);
    ts.forEachChild(node, collect);
  }

  function visit(node: import("typescript").Node) {
    if (ts.isCallExpression(node)) {
      bindings.push(...behaviorBindingsFromForEachCall(path, sourceFile, node, selectorByName, handlerByName, ts));
      const eventBinding = behaviorBindingFromCall(path, sourceFile, node, selectorByName, handlerByName, ts);
      if (eventBinding) bindings.push(eventBinding);
      const mutationBinding = mutationBindingFromCall(path, sourceFile, node, selectorByName, ts);
      if (mutationBinding) bindings.push(mutationBinding);
      bindings.push(...delegatedBehaviorBindingsFromCall(path, sourceFile, node, selectorByName, handlerByName, ts));
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
  ts: TsApi,
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
  ts: TsApi,
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
  ts: TsApi,
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
  ts: TsApi,
): BehaviorBinding | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;

  const method = node.expression.name.text;
  const mutationMethods = new Set(["appendChild", "removeChild", "replaceChildren", "setAttribute", "removeAttribute", "insertAdjacentHTML", "insertAdjacentElement", "before", "after"]);
  const classListMethods = new Set(["add", "remove", "toggle", "replace"]);
  let selector = selectorFromExpression(node.expression.expression, selectorByName, ts);
  let effect: string | null = method === "insertAdjacentHTML" ? "DOM content update" : mutationMethods.has(method) ? "DOM tree mutation" : null;

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
  ts: TsApi,
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
