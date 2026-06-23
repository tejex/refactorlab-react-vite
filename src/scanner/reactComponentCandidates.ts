import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, ReactConversionMap } from "./types";
import { extractCssSelectors, extractDomSelectors } from "./analysisSummary";
import { extractInlineStyleTexts, normalizeCssSelector } from "./extractionPlan";
import { toPascalCase } from "./reactRouteFacts";
import { isScriptPath, normalizeAssetPath } from "./scannerUtils";

export interface ReactCandidateContext {
  cssTokens: Set<string>;
  jsTokens: Set<string>;
  shapeCounts: Map<string, number>;
}

interface ScoredReactElement {
  element: Element;
  score: number;
  confidence: ReactConversionMap["componentCandidates"][number]["confidence"];
  signals: string[];
}

const componentCandidateSelector = [
  "header",
  "nav",
  "aside",
  "main",
  "section",
  "article",
  "form",
  "table",
  "footer",
  "dialog",
  "[data-component]",
  "[role='navigation']",
  "[role='banner']",
  "[role='main']",
  "[role='contentinfo']",
  "[role='dialog']",
  "[role='form']",
  "[role='search']",
  "[class*='card']",
  "[class*='modal']",
  "[class*='panel']",
  "[class*='sidebar']",
  "[class*='hero']",
  "[class*='toolbar']",
  "[class*='tabs']",
  "[class*='menu']",
  "[class*='list']",
  "[class*='grid']",
].join(",");

export function buildReactCandidateContext(files: ZipTextFile[]): ReactCandidateContext {
  const htmlFiles = files.filter((file) => normalizeAssetPath(file.path).endsWith(".html"));
  const cssTokens = new Set<string>();
  const jsTokens = new Set<string>();
  const shapeCounts = new Map<string, number>();

  for (const file of files) {
    const path = normalizeAssetPath(file.path);
    const styleBlocks = path.endsWith(".css") ? [file.text] : path.endsWith(".html") ? extractInlineStyleTexts(file.text) : [];

    for (const block of styleBlocks) {
      for (const selector of extractCssSelectors(block).map(normalizeCssSelector)) {
        if (isGlobalCssSelector(selector)) continue;
        for (const token of selectorIdentityTokens(selector)) cssTokens.add(token);
      }
    }

    if (isScriptPath(path) || path.endsWith(".html")) {
      for (const selector of extractDomSelectors(file.text)) {
        for (const token of selectorIdentityTokens(selector)) jsTokens.add(token);
      }
    }
  }

  for (const file of htmlFiles) {
    const document = new DOMParser().parseFromString(file.text, "text/html");
    for (const element of candidateElements(document)) {
      const signature = elementShapeSignature(element);
      shapeCounts.set(signature, (shapeCounts.get(signature) ?? 0) + 1);
    }
  }

  return { cssTokens, jsTokens, shapeCounts };
}

export function buildReactComponentCandidates(file: ZipTextFile, context: ReactCandidateContext): ReactConversionMap["componentCandidates"] {
  const document = new DOMParser().parseFromString(file.text, "text/html");
  const seen = new Set<string>();
  const scored = candidateElements(document)
    .map((element) => scoreReactComponentCandidate(element, context))
    .filter((candidate): candidate is ScoredReactElement => Boolean(candidate))
    .sort((a, b) => b.score - a.score || elementSelector(a.element).localeCompare(elementSelector(b.element)));
  const candidates: ReactConversionMap["componentCandidates"] = [];

  for (const candidate of scored) {
    const selector = elementSelector(candidate.element);
    const key = `${file.path}:${selector}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      sourceFile: normalizeAssetPath(file.path),
      name: reactComponentNameFromElement(candidate.element),
      kind: candidate.element.tagName.toLowerCase(),
      selector,
      confidence: candidate.confidence,
      signals: candidate.signals,
    });
  }

  return candidates.slice(0, 10);
}

export function attachBehaviorBindingsToComponents(
  bindings: BehaviorBinding[],
  componentCandidates: ReactConversionMap["componentCandidates"],
): BehaviorBinding[] {
  return bindings.map((binding) => {
    const component = bestComponentCandidateForBinding(binding, componentCandidates);
    return component ? { ...binding, componentName: component.name, componentSelector: component.selector } : binding;
  });
}

function bestComponentCandidateForBinding(
  binding: BehaviorBinding,
  componentCandidates: ReactConversionMap["componentCandidates"],
): ReactConversionMap["componentCandidates"][number] | null {
  const bindingTokens = new Set([
    ...selectorIdentityTokens(binding.selector),
    ...binding.targets.flatMap(selectorIdentityTokens),
  ]);
  if (!bindingTokens.size) return null;

  let best: { candidate: ReactConversionMap["componentCandidates"][number]; score: number } | null = null;
  for (const candidate of componentCandidates) {
    const candidateTokens = selectorIdentityTokens(candidate.selector);
    const score = candidateTokens.filter((token) => bindingTokens.has(token)).length;
    if (score > 0 && (!best || score > best.score)) best = { candidate, score };
  }

  return best?.candidate ?? null;
}

export function confidenceRankForReactComponent(confidence: ReactConversionMap["componentCandidates"][number]["confidence"]): number {
  return confidence === "High" ? 0 : 1;
}

export function selectorIdentityTokens(selector: string): string[] {
  return [...selector.matchAll(/([#.])([A-Za-z_-][\w-]*)/g)].map((match) => `${match[1]}${match[2]}`);
}

export function isGlobalCssSelector(selector: string): boolean {
  const normalized = selector.trim().toLowerCase();
  return normalized === "*" || normalized === "html" || normalized === "body" || normalized === ":root";
}

function candidateElements(document: Document): Element[] {
  return [...document.querySelectorAll(componentCandidateSelector)]
    .filter((element) => element.tagName.toLowerCase() !== "body" && element.tagName.toLowerCase() !== "html")
    .slice(0, 600);
}

function scoreReactComponentCandidate(element: Element, context: ReactCandidateContext): ScoredReactElement | null {
  const tokens = elementScopeTokens(element);
  const cssMatches = countTokenOverlap(tokens, context.cssTokens);
  const jsMatches = countTokenOverlap(tokens, context.jsTokens);
  const shapeCount = context.shapeCounts.get(elementShapeSignature(element)) ?? 0;
  const interactive = element.querySelectorAll("button, input, select, textarea, a[href], [onclick], [data-action]").length;
  const media = element.querySelectorAll("img, picture, video, audio, canvas, svg").length;
  const descendants = element.querySelectorAll("*").length;
  const signals: string[] = [];
  let score = semanticComponentWeight(element);

  if (score >= 4) signals.push("semantic layout");
  else if (score >= 2) signals.push("section structure");
  if (hasExplicitComponentName(element)) {
    score += 2;
    signals.push("named block");
  }
  if (shapeCount > 1) {
    score += shapeCount >= 4 ? 4 : 3;
    signals.push("repeated shape");
  }
  if (cssMatches > 0) {
    score += cssMatches >= 4 ? 3 : 2;
    signals.push("CSS-owned");
  }
  if (jsMatches > 0) {
    score += 4;
    signals.push("script-controlled");
  }
  if (interactive > 0) {
    score += 2;
    signals.push("interactive");
  }
  if (hasRepeatedChildShape(element)) {
    score += 2;
    signals.push("repeating children");
  }

  if (descendants >= 8) score += 2;
  else if (descendants >= 3) score += 1;
  if (media > 0) {
    score += 1;
    signals.push("media/content");
  }
  if (isGenericLayoutWrapper(element, descendants)) score -= 3;
  if (score < 7) return null;

  return {
    element,
    score,
    confidence: score >= 11 || jsMatches > 0 || (shapeCount > 1 && cssMatches > 0) ? "High" : "Medium",
    signals: signals.slice(0, 4),
  };
}

function reactComponentNameFromElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const label = element.getAttribute("data-component") || element.getAttribute("aria-label") || element.id || meaningfulClassName(element) || tag;
  const base = toPascalCase(label);
  const suffix = componentSuffixForTag(tag);
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function componentSuffixForTag(tag: string): string {
  const suffixes: Record<string, string> = { nav: "Nav", header: "Header", footer: "Footer", aside: "Aside", form: "Form", table: "Table", dialog: "Dialog", main: "Main", article: "Article" };
  return suffixes[tag] ?? "Section";
}

function meaningfulClassName(element: Element): string | null {
  const generic = new Set(["active", "button", "btn", "card", "col", "container", "grid", "hidden", "row", "section", "wrapper"]);
  return [...element.classList].find((className) => !generic.has(className.toLowerCase()) && className.length <= 48) ?? null;
}

function semanticComponentWeight(element: Element): number {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase();
  if (["navigation", "banner", "main", "contentinfo", "dialog", "form", "search"].includes(role ?? "")) return 4;
  if (["nav", "header", "footer", "aside", "main", "form", "table", "dialog"].includes(tag)) return 4;
  if (["section", "article"].includes(tag)) return 2;
  return 0;
}

function hasExplicitComponentName(element: Element): boolean {
  return Boolean(element.getAttribute("data-component") || element.getAttribute("aria-label") || element.id || meaningfulClassName(element));
}

function elementScopeTokens(element: Element): Set<string> {
  const tokens = new Set<string>();
  const scopedElements = [element, ...element.querySelectorAll("[id], [class]")];
  for (const scopedElement of scopedElements) {
    if (scopedElement.id) tokens.add(`#${scopedElement.id}`);
    for (const className of scopedElement.classList) tokens.add(`.${className}`);
  }
  return tokens;
}

function countTokenOverlap(tokens: Set<string>, references: Set<string>): number {
  let count = 0;
  for (const token of tokens) {
    if (references.has(token)) count += 1;
  }
  return count;
}

function elementShapeSignature(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role")?.toLowerCase() ?? "";
  const childTags = [...element.children].slice(0, 8).map((child) => child.tagName.toLowerCase()).join(",");
  const interactive = element.querySelector("button, input, select, textarea, a[href], [onclick]") ? "interactive" : "static";
  return `${tag}|${role}|${childTags}|${interactive}`;
}

function hasRepeatedChildShape(element: Element): boolean {
  const counts = new Map<string, number>();
  for (const child of element.children) {
    const key = `${child.tagName.toLowerCase()}|${meaningfulClassName(child) ?? ""}|${child.children.length}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 2);
}

function isGenericLayoutWrapper(element: Element, descendants: number): boolean {
  const tag = element.tagName.toLowerCase();
  if (!["main", "section", "div"].includes(tag) || descendants < 80) return false;
  const specificName = element.getAttribute("data-component") || element.getAttribute("aria-label") || element.id || meaningfulClassName(element);
  return !specificName;
}

function elementSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${element.id}`;
  const classes = [...element.classList].slice(0, 2).map((className) => `.${className}`).join("");
  return classes ? `${tag}${classes}` : tag;
}
