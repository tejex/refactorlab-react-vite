import type { BehaviorBinding } from "./types";

type TsApi = typeof import("typescript");

export interface BehaviorEffectSummary {
  effects: string[];
  targets: string[];
  endpoints: string[];
}

export function summarizeBehaviorEffects(
  node: import("typescript").Node,
  selectorByName: Map<string, string>,
  ts: TsApi,
): BehaviorEffectSummary {
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

    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "XMLHttpRequest") effects.add("network request");
    if (ts.isNewExpression(current) && ts.isIdentifier(current.expression) && current.expression.text === "FormData") effects.add("form data");
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
  return { effects: [...effects].sort(), targets: [...targets].sort(), endpoints: [...endpoints].sort() };
}

export function selectorFromExpression(
  expression: import("typescript").Expression,
  selectorByName: Map<string, string>,
  ts: TsApi,
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

export function mutationTargets(
  selector: string,
  method: string,
  args: import("typescript").NodeArray<import("typescript").Expression>,
  ts: TsApi,
): string[] {
  const classNames = [...args]
    .map((arg) => stringValue(arg, ts))
    .filter((value): value is string => Boolean(value))
    .filter((value) => /^[A-Za-z_-][\w-]*$/.test(value));

  if (["add", "remove", "toggle", "replace"].includes(method) && classNames.length) return classNames.map((className) => `${selector}.${className}`);
  if (["setAttribute", "removeAttribute"].includes(method)) {
    const attribute = stringValue(args[0], ts);
    return attribute ? [`${selector} [${attribute}]`] : [selector];
  }
  if (method === "insertAdjacentHTML") return [`${selector} html`];
  return [selector];
}

export function delegatedSelectorsFromNode(node: import("typescript").Node, ts: TsApi): string[] {
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

export function stringValue(node: import("typescript").Node | undefined, ts: TsApi): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

export function handlerLabel(node: import("typescript").Node | undefined, ts: TsApi): string {
  if (!node) return "inline handler";
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "inline handler";
  return "handler expression";
}

export function bindingEffectsForEvent(event: string, effects: string[]): string[] {
  const nextEffects = new Set(effects);
  if (event === "submit") nextEffects.add("form/event handling");
  if (event === "input" || event === "change") nextEffects.add("input state change");
  return [...nextEffects].sort();
}

export function behaviorBindingConfidence(selector: string, event: string, effects: string[], targets: string[]): BehaviorBinding["confidence"] {
  if ((selector.startsWith(".") || selector.startsWith("#")) && event !== "event" && effects.length > 0) return "High";
  if (event !== "event" && (effects.length > 0 || targets.length > 0)) return "Medium";
  return "Review";
}

export function isGlobalEventTarget(selector: string): boolean {
  return selector === "document" || selector === "window" || selector === "body" || selector === "html";
}

export function lineNumberForNode(sourceFile: import("typescript").SourceFile, node: import("typescript").Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function selectorFromDomCall(node: import("typescript").CallExpression, ts: TsApi): string | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  const method = node.expression.name.text;
  const value = stringValue(node.arguments[0], ts);
  if (!value) return null;
  if (method === "querySelector" || method === "querySelectorAll" || method === "closest") return value;
  if (method === "getElementById") return `#${value}`;
  if (method === "getElementsByClassName") return `.${value}`;
  return null;
}

function endpointFromFetchCall(node: import("typescript").CallExpression, ts: TsApi): string | null {
  const url = endpointUrlFromExpression(node.arguments[0], ts);
  if (!url) return null;
  const init = node.arguments[1];
  const method = init && ts.isObjectLiteralExpression(init) ? objectStringProperty(init, "method", ts) : null;
  return method ? `${method.toUpperCase()} ${url}` : `GET ${url}`;
}

function endpointFromXhrOpenCall(node: import("typescript").CallExpression, ts: TsApi): string | null {
  const method = stringValue(node.arguments[0], ts);
  const url = endpointUrlFromExpression(node.arguments[1], ts);
  if (!url) return null;
  return method ? `${method.toUpperCase()} ${url}` : url;
}

function endpointUrlFromExpression(node: import("typescript").Node | undefined, ts: TsApi): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Request") {
    return endpointUrlFromExpression(node.arguments?.[0], ts);
  }
  return null;
}

function objectStringProperty(objectLiteral: import("typescript").ObjectLiteralExpression, name: string, ts: TsApi): string | null {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
    if (propertyName === name) return stringValue(property.initializer, ts);
  }
  return null;
}
