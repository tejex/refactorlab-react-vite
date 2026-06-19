import * as parse5 from "parse5";
import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, InlineAssetPlan, JsTsModuleMap, ProjectIntegrityMap, ReactConversionMap } from "./types";
import { extractCssSelectors, extractDomSelectors } from "./analysisSummary";
import { extractInlineStyleTexts, findExternalAssetOrder, normalizeCssSelector } from "./extractionPlan";
import { confidenceRankForBehaviorBinding, dedupeBehaviorBindings } from "./jsTsModuleMap";
import { dirname, isScriptPath, joinProjectPath, normalizeAssetPath } from "./scannerUtils";

export function buildReactConversionMap(
  files: ZipTextFile[],
  inlineAssetPlan: InlineAssetPlan,
  integrityMap: ProjectIntegrityMap,
  jsTsModuleMap: JsTsModuleMap,
): ReactConversionMap {
  const htmlFiles = files.filter((file) => normalizeAssetPath(file.path).endsWith(".html"));
  const inlineBlockCounts = new Map<string, number>();
  const componentContext = buildReactCandidateContext(files);

  for (const block of inlineAssetPlan.blocks) {
    inlineBlockCounts.set(block.file, (inlineBlockCounts.get(block.file) ?? 0) + 1);
  }

  const routes = htmlFiles
    .map((file) => {
      const assetOrder = findExternalAssetOrder(file);
      return {
        sourceFile: normalizeAssetPath(file.path),
        routePath: reactRouteFromHtmlPath(file.path),
        componentName: reactPageComponentName(file.path),
        title: htmlTitle(file.text),
        stylesheets: assetOrder.stylesheets.length,
        scripts: assetOrder.scripts.length,
        inlineBlocks: inlineBlockCounts.get(file.path) ?? 0,
      };
    })
    .sort((a, b) => a.routePath.localeCompare(b.routePath) || a.sourceFile.localeCompare(b.sourceFile));

  const componentCandidates = htmlFiles
    .flatMap((file) => buildReactComponentCandidates(file, componentContext))
    .sort((a, b) => confidenceRankForReactComponent(a.confidence) - confidenceRankForReactComponent(b.confidence) || a.sourceFile.localeCompare(b.sourceFile))
    .slice(0, 120);
  const behaviorBindings = attachBehaviorBindingsToComponents(jsTsModuleMap.behaviorBindings, componentCandidates);
  const componentOwnership = buildComponentOwnership(files, routes, componentCandidates, behaviorBindings);
  const routePackets = buildRouteConversionPackets(routes, componentOwnership, behaviorBindings, integrityMap.missingReferences);
  const behaviorFiles = jsTsModuleMap.files
    .filter((file) => file.sideEffects > 0)
    .map((file) => ({ path: file.path, sideEffects: file.sideEffects }))
    .sort((a, b) => b.sideEffects - a.sideEffects || a.path.localeCompare(b.path));
  const aiHandoff = buildAiHandoffPlan({
    routes,
    routePackets,
    componentOwnership,
    behaviorFiles,
    behaviorBindings,
    blockers: integrityMap.missingReferences,
    safeChangeCount: inlineAssetPlan.guaranteedSafeChanges.length,
    unresolvedImportCount: jsTsModuleMap.unresolvedImports.length,
  });

  return {
    routes,
    routePackets,
    aiHandoff,
    componentCandidates,
    componentOwnership,
    behaviorFiles,
    behaviorBindings,
    blockers: integrityMap.missingReferences,
  };
}

interface AiHandoffInput {
  routes: ReactConversionMap["routes"];
  routePackets: ReactConversionMap["routePackets"];
  componentOwnership: ReactConversionMap["componentOwnership"];
  behaviorFiles: ReactConversionMap["behaviorFiles"];
  behaviorBindings: BehaviorBinding[];
  blockers: ProjectIntegrityMap["missingReferences"];
  safeChangeCount: number;
  unresolvedImportCount: number;
}

function buildAiHandoffPlan(input: AiHandoffInput): ReactConversionMap["aiHandoff"] {
  const primaryRoute = bestFirstRoutePacket(input.routePackets);
  const blockerCount = input.blockers.length + input.unresolvedImportCount;
  const status = blockerCount > 0 ? "Prep needed" : input.routePackets.length ? "Ready" : "Review first";
  const confidence =
    blockerCount > 0
      ? "Review"
      : input.componentOwnership.length > 0 && input.behaviorBindings.length > 0
        ? "High"
        : input.routePackets.length > 0
          ? "Medium"
          : "Review";
  const steps = [
    input.safeChangeCount > 0
      ? {
          title: "Apply parser-safe extractions",
          detail: `${input.safeChangeCount.toLocaleString()} copy-only extraction change(s) are already verified.`,
          facts: [`safeChanges=${input.safeChangeCount.toLocaleString()}`],
        }
      : null,
    blockerCount > 0
      ? {
          title: "Clear preflight blockers",
          detail: "Fix missing references and unresolved imports before asking an AI to rewrite routes.",
          facts: [
            `missingReferences=${input.blockers.length.toLocaleString()}`,
            `unresolvedImports=${input.unresolvedImportCount.toLocaleString()}`,
          ],
        }
      : null,
    primaryRoute
      ? {
          title: `Start with ${primaryRoute.routePath}`,
          detail: `Use routes/${primaryRoute.slug}.json as the first conversion packet.`,
          facts: [
            `source=${primaryRoute.sourceFile}`,
            `owners=${primaryRoute.componentOwners.length.toLocaleString()}`,
            `behaviors=${primaryRoute.behaviorBindings.length.toLocaleString()}`,
            `blockers=${primaryRoute.blockers.length.toLocaleString()}`,
          ],
        }
      : null,
    input.componentOwnership.length > 0
      ? {
          title: "Convert owned components",
          detail: "Use component ownership groups so the AI reads the right HTML, CSS, behavior, and assets together.",
          facts: [`owners=${input.componentOwnership.length.toLocaleString()}`],
        }
      : null,
    input.behaviorBindings.length > 0
      ? {
          title: "Convert behavior bindings last",
          detail: "Turn detected DOM events and mutations into framework state, props, effects, and handlers.",
          facts: [
            `bindings=${input.behaviorBindings.length.toLocaleString()}`,
            `behaviorFiles=${input.behaviorFiles.length.toLocaleString()}`,
          ],
        }
      : null,
  ].filter((step): step is ReactConversionMap["aiHandoff"]["steps"][number] => Boolean(step));

  return {
    status,
    confidence,
    summary: [
      `${input.routePackets.length.toLocaleString()} route packet(s)`,
      `${input.componentOwnership.length.toLocaleString()} component owner group(s)`,
      `${input.behaviorBindings.length.toLocaleString()} behavior binding(s)`,
      primaryRoute ? `start=${primaryRoute.routePath}` : "start=none",
    ].join(" / "),
    primaryRoute: primaryRoute
      ? {
          routePath: primaryRoute.routePath,
          sourceFile: primaryRoute.sourceFile,
          packetSlug: primaryRoute.slug,
          componentOwners: primaryRoute.componentOwners.length,
          behaviorBindings: primaryRoute.behaviorBindings.length,
          blockers: primaryRoute.blockers.length,
        }
      : null,
    steps: steps.slice(0, 5),
    promptFacts: [
      "Use project-map.json as the source of truth.",
      primaryRoute ? `Start with routes/${primaryRoute.slug}.json.` : "Choose one route packet before editing.",
      "Read component locators before scanning whole files.",
      "Preserve class names on the first pass.",
      "Convert one route at a time.",
    ],
  };
}

function bestFirstRoutePacket(
  routePackets: ReactConversionMap["routePackets"],
): ReactConversionMap["routePackets"][number] | null {
  if (!routePackets.length) return null;

  return [...routePackets].sort((a, b) => routePacketHandoffScore(b) - routePacketHandoffScore(a) || a.routePath.localeCompare(b.routePath))[0] ?? null;
}

function routePacketHandoffScore(packet: ReactConversionMap["routePackets"][number]): number {
  return (
    packet.componentOwners.length * 5 +
    packet.behaviorBindings.length * 3 +
    packet.cssSelectors.length +
    packet.assets.length -
    packet.blockers.length * 25
  );
}

interface ReactCandidateContext {
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

function buildReactCandidateContext(files: ZipTextFile[]): ReactCandidateContext {
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

function buildReactComponentCandidates(file: ZipTextFile, context: ReactCandidateContext): ReactConversionMap["componentCandidates"] {
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

function attachBehaviorBindingsToComponents(
  bindings: BehaviorBinding[],
  componentCandidates: ReactConversionMap["componentCandidates"],
): BehaviorBinding[] {
  return bindings.map((binding) => {
    const component = bestComponentCandidateForBinding(binding, componentCandidates);
    return component
      ? {
          ...binding,
          componentName: component.name,
          componentSelector: component.selector,
        }
      : binding;
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

interface CssSelectorEntry {
  selector: string;
  tokens: string[];
}

function buildComponentOwnership(
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

function buildRouteConversionPackets(
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
      .filter((binding) => {
        if (!binding.componentName || !binding.componentSelector) return false;
        return ownerKeys.has(`${binding.componentName}::${binding.componentSelector}`);
      })
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
      blockers: blockers
        .filter((blocker) => blocker.sourceFile === route.sourceFile)
        .sort((a, b) => a.missingPath.localeCompare(b.missingPath)),
      suggestedOrder: routePacketSuggestedOrder(route, componentOwners, routeBehaviorBindings),
    };
  });
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
    behaviorBindings.length
      ? "Convert behavior bindings into framework event handlers, state, effects, or data calls."
      : "Preserve static markup and CSS class names before adding behavior.",
    "Keep existing CSS class names during the first pass.",
    "Run or inspect the route after conversion before moving to the next route.",
  ];
}

function routePacketSlug(routePath: string): string {
  const slug = routePath
    .replace(/^\/+$/, "home")
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "home";
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
        if (!tokens.length) continue;
        selectors.set(selector, { selector, tokens });
      }
    }
  }

  return [...selectors.values()];
}

function cssSelectorsForComponent(
  candidate: ReactConversionMap["componentCandidates"][number],
  selectors: CssSelectorEntry[],
): string[] {
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
  const parsedSelector = parseGeneratedComponentSelector(selector);
  if (!parsedSelector) return null;
  const targetSelector = parsedSelector;

  let found: Parse5NodeWithLocation | null = null;

  function visit(node: parse5.DefaultTreeAdapterMap["node"]) {
    if (found) return;
    if (isParse5ElementNode(node) && parse5NodeMatchesSelector(node, targetSelector)) {
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
      const classes = (attrs.get("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((className) => `.${className}`)
        .join("");
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
  return srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function normalizeComponentAssetPath(sourceFile: string, rawAsset: string): string | null {
  if (
    !rawAsset ||
    rawAsset.startsWith("#") ||
    /^(https?:)?\/\//i.test(rawAsset) ||
    /^(data|mailto|tel|javascript|blob):/i.test(rawAsset)
  ) {
    return null;
  }

  const cleanAsset = normalizeAssetPath(rawAsset.split(/[?#]/)[0] ?? "");
  if (!cleanAsset) return null;
  return rawAsset.startsWith("/") ? cleanAsset : joinProjectPath(dirname(sourceFile), cleanAsset);
}

function componentOwnerScore(owner: ReactConversionMap["componentOwnership"][number]): number {
  return (
    owner.behaviorBindings.length * 5 +
    owner.cssSelectors.length * 2 +
    owner.assets.length +
    owner.routesUsedIn.length * 3 +
    (owner.confidence === "High" ? 6 : 0)
  );
}

function reactRouteFromHtmlPath(path: string): string {
  const normalized = normalizeAssetPath(path).replace(/\.html$/i, "");
  const parts = normalized.split("/").filter(Boolean);
  const routeParts = parts.at(-1)?.toLowerCase() === "index" ? parts.slice(0, -1) : parts;
  return routeParts.length ? `/${routeParts.join("/")}` : "/";
}

function reactPageComponentName(path: string): string {
  const routeParts = reactRouteFromHtmlPath(path).split("/").filter(Boolean);
  if (!routeParts.length) return "HomePage";
  return `${toPascalCase(routeParts.join(" "))}Page`;
}

function htmlTitle(text: string): string {
  const title = new DOMParser().parseFromString(text, "text/html").querySelector("title")?.textContent?.trim();
  return title || "Untitled page";
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
  const repeatedChildren = hasRepeatedChildShape(element);
  const semanticWeight = semanticComponentWeight(element);
  const signals: string[] = [];
  let score = semanticWeight;

  if (semanticWeight >= 4) signals.push("semantic layout");
  else if (semanticWeight >= 2) signals.push("section structure");

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

  if (repeatedChildren) {
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
  const label =
    element.getAttribute("data-component") ||
    element.getAttribute("aria-label") ||
    element.id ||
    meaningfulClassName(element) ||
    tag;
  const base = toPascalCase(label);
  const suffix = componentSuffixForTag(tag);
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function componentSuffixForTag(tag: string): string {
  if (tag === "nav") return "Nav";
  if (tag === "header") return "Header";
  if (tag === "footer") return "Footer";
  if (tag === "aside") return "Aside";
  if (tag === "form") return "Form";
  if (tag === "table") return "Table";
  if (tag === "dialog") return "Dialog";
  if (tag === "main") return "Main";
  if (tag === "article") return "Article";
  return "Section";
}

function meaningfulClassName(element: Element): string | null {
  const generic = new Set(["active", "button", "btn", "card", "col", "container", "grid", "hidden", "row", "section", "wrapper"]);
  return [...element.classList].find((className) => !generic.has(className.toLowerCase()) && className.length <= 48) ?? null;
}

function confidenceRankForReactComponent(confidence: ReactConversionMap["componentCandidates"][number]["confidence"]): number {
  return confidence === "High" ? 0 : 1;
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

function selectorIdentityTokens(selector: string): string[] {
  return [...selector.matchAll(/([#.])([A-Za-z_-][\w-]*)/g)].map((match) => `${match[1]}${match[2]}`);
}

function isGlobalCssSelector(selector: string): boolean {
  const normalized = selector.trim().toLowerCase();
  return normalized === "*" || normalized === "html" || normalized === "body" || normalized === ":root";
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

function toPascalCase(value: string): string {
  const words = value.match(/[a-z0-9]+/gi) ?? [];
  const name = words.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join("");
  return name || "Component";
}
