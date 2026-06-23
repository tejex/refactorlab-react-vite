import * as parse5 from "parse5";
import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, ProjectIntegrityMap, ReactConversionMap } from "./types";
import { extractCssSelectors } from "./analysisSummary";
import { extractInlineStyleTexts, normalizeCssSelector } from "./extractionPlan";
import { confidenceRankForBehaviorBinding, dedupeBehaviorBindings } from "./jsTsModuleMap";
import { isGlobalCssSelector, selectorIdentityTokens } from "./reactComponentCandidates";
import { dirname, joinProjectPath, normalizeAssetPath } from "./scannerUtils";

interface CssSelectorEntry {
  selector: string;
  tokens: string[];
}

export function buildComponentOwnership(
  files: ZipTextFile[],
  routes: ReactConversionMap["routes"],
  componentCandidates: ReactConversionMap["componentCandidates"],
  behaviorBindings: BehaviorBinding[],
): ReactConversionMap["componentOwnership"] {
  const filesByPath = new Map(files.map((file) => [normalizeAssetPath(file.path), file]));
  const routeBySource = new Map(routes.map((route) => [route.sourceFile, route.routePath]));
  const cssSelectors = buildCssSelectorCatalog(files);
  const groups = new Map<string, ReactConversionMap["componentOwnership"][number]>();

  for (const candidate of componentCandidates) {
    const key = `${candidate.name}::${candidate.selector}`;
    const existing = groups.get(key);
    const sourceFiles = new Set(existing?.sourceFiles ?? []);
    const routesUsedIn = new Set(existing?.routesUsedIn ?? []);
    const signals = new Set(existing?.signals ?? []);
    const assets = new Set(existing?.assets ?? []);
    const locators = [...(existing?.locators ?? [])];

    sourceFiles.add(candidate.sourceFile);
    const route = routeBySource.get(candidate.sourceFile);
    if (route) routesUsedIn.add(route);
    for (const signal of candidate.signals) signals.add(signal);
    for (const asset of assetsForComponentCandidate(filesByPath.get(candidate.sourceFile), candidate.selector)) assets.add(asset);

    const locator = componentLocatorForCandidate(filesByPath.get(candidate.sourceFile), candidate.selector);
    if (locator && !locators.some((item) => item.sourceFile === locator.sourceFile && item.selector === locator.selector && item.lineStart === locator.lineStart)) {
      locators.push(locator);
    }

    const behavior = behaviorBindings.filter((binding) => binding.componentName === candidate.name && binding.componentSelector === candidate.selector);
    const css = cssSelectorsForComponent(candidate, cssSelectors);
    groups.set(key, {
      componentName: candidate.name,
      selector: candidate.selector,
      confidence: existing?.confidence === "High" || candidate.confidence === "High" ? "High" : "Medium",
      signals: [...signals].sort(),
      sourceFiles: [...sourceFiles].sort(),
      routesUsedIn: [...routesUsedIn].sort(),
      locators: locators.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.lineStart - b.lineStart).slice(0, 12),
      cssSelectors: [...new Set([...(existing?.cssSelectors ?? []), ...css])].sort().slice(0, 30),
      behaviorBindings: dedupeBehaviorBindings([...(existing?.behaviorBindings ?? []), ...behavior]).slice(0, 30),
      assets: [...assets].sort().slice(0, 30),
    });
  }

  return [...groups.values()]
    .filter((owner) => owner.cssSelectors.length > 0 || owner.behaviorBindings.length > 0 || owner.assets.length > 0 || owner.routesUsedIn.length > 1)
    .sort((a, b) => componentOwnerScore(b) - componentOwnerScore(a) || a.componentName.localeCompare(b.componentName))
    .slice(0, 80);
}

export function buildRouteConversionPackets(
  routes: ReactConversionMap["routes"],
  componentOwnership: ReactConversionMap["componentOwnership"],
  behaviorBindings: BehaviorBinding[],
  blockers: ProjectIntegrityMap["missingReferences"],
): ReactConversionMap["routePackets"] {
  return routes.map((route) => {
    const componentOwners = componentOwnership
      .filter((owner) => owner.routesUsedIn.includes(route.routePath) || owner.sourceFiles.includes(route.sourceFile))
      .sort((a, b) => componentOwnerScore(b) - componentOwnerScore(a) || a.componentName.localeCompare(b.componentName));
    const ownerKeys = new Set(componentOwners.map((owner) => `${owner.componentName}::${owner.selector}`));
    const routeBehaviorBindings = behaviorBindings
      .filter((binding) => binding.componentName && binding.componentSelector && ownerKeys.has(`${binding.componentName}::${binding.componentSelector}`))
      .sort((a, b) => confidenceRankForBehaviorBinding(a.confidence) - confidenceRankForBehaviorBinding(b.confidence) || a.sourceFile.localeCompare(b.sourceFile) || a.line - b.line);

    return {
      slug: routePacketSlug(route.routePath),
      routePath: route.routePath,
      sourceFile: route.sourceFile,
      pageComponentName: route.componentName,
      title: route.title,
      componentOwners,
      behaviorBindings: dedupeBehaviorBindings(routeBehaviorBindings).slice(0, 80),
      cssSelectors: [...new Set(componentOwners.flatMap((owner) => owner.cssSelectors))].sort().slice(0, 120),
      assets: [...new Set(componentOwners.flatMap((owner) => owner.assets))].sort().slice(0, 120),
      blockers: blockers.filter((blocker) => blocker.sourceFile === route.sourceFile).sort((a, b) => a.missingPath.localeCompare(b.missingPath)),
      suggestedOrder: routePacketSuggestedOrder(route, componentOwners, routeBehaviorBindings),
    };
  });
}

function buildCssSelectorCatalog(files: ZipTextFile[]): CssSelectorEntry[] {
  const selectors = new Map<string, CssSelectorEntry>();
  for (const file of files) {
    const path = normalizeAssetPath(file.path);
    const styleBlocks = path.endsWith(".css") ? [file.text] : path.endsWith(".html") ? extractInlineStyleTexts(file.text) : [];
    for (const block of styleBlocks) {
      for (const selector of extractCssSelectors(block).map(normalizeCssSelector)) {
        if (isGlobalCssSelector(selector)) continue;
        const tokens = selectorIdentityTokens(selector);
        if (tokens.length) selectors.set(selector, { selector, tokens });
      }
    }
  }
  return [...selectors.values()];
}

function cssSelectorsForComponent(candidate: ReactConversionMap["componentCandidates"][number], selectors: CssSelectorEntry[]): string[] {
  const componentTokens = selectorIdentityTokens(candidate.selector);
  if (!componentTokens.length) return [];
  return selectors
    .filter((entry) => entry.tokens.some((token) => componentTokens.includes(token)))
    .map((entry) => entry.selector)
    .slice(0, 30);
}

function assetsForComponentCandidate(file: ZipTextFile | undefined, selector: string): string[] {
  if (!file) return [];
  const document = new DOMParser().parseFromString(file.text, "text/html");
  const element = findComponentElement(document, selector);
  if (!element) return [];

  const rawAssets = [
    ...[...element.querySelectorAll("[src]")].map((node) => node.getAttribute("src")),
    ...[...element.querySelectorAll("[data-src]")].map((node) => node.getAttribute("data-src")),
    ...[...element.querySelectorAll("source[srcset], img[srcset]")].flatMap((node) => srcsetValues(node.getAttribute("srcset"))),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(rawAssets.map((asset) => normalizeComponentAssetPath(file.path, asset)).filter(Boolean) as string[])].sort();
}

function componentLocatorForCandidate(
  file: ZipTextFile | undefined,
  selector: string,
): ReactConversionMap["componentOwnership"][number]["locators"][number] | null {
  if (!file) return null;
  const parsed = parse5.parse(file.text, { sourceCodeLocationInfo: true });
  const node = findParse5NodeBySelector(parsed, selector);
  const location = node?.sourceCodeLocation;
  if (!node || !location) return null;

  const rawHtml = file.text.slice(location.startOffset, location.endOffset);
  return {
    sourceFile: normalizeAssetPath(file.path),
    selector,
    lineStart: location.startLine,
    lineEnd: location.endLine,
    htmlBytes: new TextEncoder().encode(rawHtml).byteLength,
    childSummary: childSummaryForParse5Node(node).slice(0, 12),
    tinyPreview: tinyHtmlPreview(rawHtml),
  };
}

type Parse5NodeWithLocation = parse5.DefaultTreeAdapterMap["element"];

function findParse5NodeBySelector(root: parse5.DefaultTreeAdapterMap["node"], selector: string): Parse5NodeWithLocation | null {
  const targetSelector = parseGeneratedComponentSelector(selector);
  if (!targetSelector) return null;
  const parsedSelector = targetSelector;
  let found: Parse5NodeWithLocation | null = null;

  function visit(node: parse5.DefaultTreeAdapterMap["node"]) {
    if (found) return;
    if (isParse5ElementNode(node) && parse5NodeMatchesSelector(node, parsedSelector)) {
      found = node;
      return;
    }
    for (const child of parse5ChildNodes(node)) visit(child);
  }

  visit(root);
  return found;
}

interface ParsedGeneratedSelector {
  tag: string;
  id: string | null;
  classes: string[];
}

function parseGeneratedComponentSelector(selector: string): ParsedGeneratedSelector | null {
  const match = selector.match(/^([a-z0-9-]+)(#[A-Za-z_-][\w-]*)?((?:\.[A-Za-z_-][\w-]*)*)$/i);
  if (!match) return null;
  return {
    tag: match[1].toLowerCase(),
    id: match[2]?.slice(1) ?? null,
    classes: [...(match[3] ?? "").matchAll(/\.([A-Za-z_-][\w-]*)/g)].map((classMatch) => classMatch[1]),
  };
}

function parse5NodeMatchesSelector(node: parse5.DefaultTreeAdapterMap["element"], selector: ParsedGeneratedSelector): boolean {
  if (node.tagName.toLowerCase() !== selector.tag) return false;
  const attrs = parse5Attributes(node);
  if (selector.id && attrs.get("id") !== selector.id) return false;
  const classList = new Set((attrs.get("class") ?? "").split(/\s+/).filter(Boolean));
  return selector.classes.every((className) => classList.has(className));
}

function childSummaryForParse5Node(node: parse5.DefaultTreeAdapterMap["node"]): string[] {
  return parse5ChildNodes(node)
    .filter(isParse5ElementNode)
    .slice(0, 12)
    .map((child) => {
      const attrs = parse5Attributes(child);
      const id = attrs.get("id") ? `#${attrs.get("id")}` : "";
      const classes = (attrs.get("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((className) => `.${className}`).join("");
      return `${child.tagName.toLowerCase()}${id}${classes}`;
    });
}

function tinyHtmlPreview(rawHtml: string): string {
  const compact = rawHtml.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function isParse5ElementNode(node: parse5.DefaultTreeAdapterMap["node"]): node is parse5.DefaultTreeAdapterMap["element"] {
  return "tagName" in node;
}

function parse5ChildNodes(node: parse5.DefaultTreeAdapterMap["node"]): parse5.DefaultTreeAdapterMap["node"][] {
  return "childNodes" in node ? [...node.childNodes] : [];
}

function parse5Attributes(node: parse5.DefaultTreeAdapterMap["element"]): Map<string, string> {
  return new Map(node.attrs.map((attr) => [attr.name, attr.value]));
}

function findComponentElement(document: Document, selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function srcsetValues(srcset: string | null): string[] {
  if (!srcset) return [];
  return srcset.split(",").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
}

function normalizeComponentAssetPath(sourceFile: string, rawAsset: string): string | null {
  if (!rawAsset || rawAsset.startsWith("#") || /^(https?:)?\/\//i.test(rawAsset) || /^(data|mailto|tel|javascript|blob):/i.test(rawAsset)) {
    return null;
  }
  const cleanAsset = normalizeAssetPath(rawAsset.split(/[?#]/)[0] ?? "");
  if (!cleanAsset) return null;
  return rawAsset.startsWith("/") ? cleanAsset : joinProjectPath(dirname(sourceFile), cleanAsset);
}

function componentOwnerScore(owner: ReactConversionMap["componentOwnership"][number]): number {
  return owner.behaviorBindings.length * 5 + owner.cssSelectors.length * 2 + owner.assets.length + owner.routesUsedIn.length * 3 + (owner.confidence === "High" ? 6 : 0);
}

function routePacketSuggestedOrder(
  route: ReactConversionMap["routes"][number],
  componentOwners: ReactConversionMap["componentOwnership"],
  behaviorBindings: BehaviorBinding[],
): string[] {
  return [
    `Read ${route.sourceFile} and convert it into ${route.componentName}.`,
    componentOwners.length
      ? `Convert owned components first: ${componentOwners.slice(0, 6).map((owner) => owner.componentName).join(", ")}.`
      : "Convert the page shell first because no component ownership groups were found.",
    behaviorBindings.length ? "Convert behavior bindings into framework event handlers, state, effects, or data calls." : "Preserve static markup and CSS class names before adding behavior.",
    "Keep existing CSS class names during the first pass.",
    "Run or inspect the route after conversion before moving to the next route.",
  ];
}

function routePacketSlug(routePath: string): string {
  const slug = routePath.replace(/^\/+$/, "home").replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return slug || "home";
}
