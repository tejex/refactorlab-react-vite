import { countMatches, isScriptPath, topValues } from "./scannerUtils";
import type { ZipTextFile } from "./browserZip";

export interface ClientFileAnalysis {
  path: string;
  extension: string;
  lines: number;
  bytes: number;
  riskScore: number;
  selectors: string[];
  symbols: string[];
  sideEffects: Record<string, number>;
  tree: {
    parser: string;
    nodes: number;
    maxDepth: number;
    facts: string[];
  };
}

export function analyzeFile(file: ZipTextFile): ClientFileAnalysis {
  const extension = file.path.slice(file.path.lastIndexOf("."));
  const lines = file.text.split(/\r\n|\r|\n/).length;
  const sideEffects = countSideEffects(file.text);
  const branches = countMatches(file.text, /\b(if|else if|switch|case|catch|for|while|do)\b|\?|&&|\|\|/g);
  const selectors = extension === ".css" ? extractCssSelectors(file.text) : extractDomSelectors(file.text);
  const symbols = extractSymbols(file.text);
  const tree = estimateTree(file.text, extension);
  const sideEffectScore = Object.values(sideEffects).reduce((total, count) => total + count, 0) * 8;
  const riskScore = lines + branches * 10 + selectors.length * 2 + symbols.length + sideEffectScore + tree.maxDepth * 6;

  return {
    path: file.path,
    extension,
    lines,
    bytes: file.bytes,
    riskScore,
    selectors,
    symbols,
    sideEffects,
    tree,
  };
}

export function countSideEffects(text: string): Record<string, number> {
  return {
    network: countMatches(text, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/g),
    storage: countMatches(text, /\b(localStorage|sessionStorage|indexedDB|caches)\b/g),
    dom: countMatches(text, /\b(querySelector|querySelectorAll|getElementById|classList|innerHTML|appendChild|removeChild)\b/g),
    timer: countMatches(text, /\b(setTimeout|setInterval|requestAnimationFrame)\b/g),
    logging: countMatches(text, /\b(console\.(log|warn|error|info|debug))\b/g),
  };
}

function estimateTree(text: string, extension: string): ClientFileAnalysis["tree"] {
  if (extension === ".html") {
    const document = new DOMParser().parseFromString(text, "text/html");
    const elements = [...document.querySelectorAll("*")];
    const topTags = topValues(elements.map((element) => element.tagName.toLowerCase()), 5);
    const ids = elements.filter((element) => element.id).length;
    const classed = elements.filter((element) => element.classList.length > 0).length;
    const parserErrors = document.querySelectorAll("parsererror").length;

    return {
      parser: "DOMParser",
      nodes: elements.length,
      maxDepth: maxElementDepth(document.body),
      facts: [
        `elements=${elements.length.toLocaleString()}`,
        `maxDepth=${maxElementDepth(document.body)}`,
        `topTags=${topTags.join(", ") || "none"}`,
        `scripts=${document.scripts.length}`,
        `links=${document.querySelectorAll("link").length}`,
        `forms=${document.forms.length}`,
        `ids=${ids}`,
        `classedElements=${classed}`,
        `parserErrors=${parserErrors}`,
      ],
    };
  }

  if (extension === ".css") {
    return {
      parser: "CSS text",
      nodes: countMatches(text, /[{;}]/g),
      maxDepth: maxBraceDepth(text),
      facts: [`rules≈${countMatches(text, /\{/g)}`, `maxBraceDepth=${maxBraceDepth(text)}`],
    };
  }

  return {
    parser: "JS text",
    nodes: countMatches(text, /\b(function|class|const|let|var|if|for|while|switch|return)\b/g),
    maxDepth: maxBraceDepth(text),
    facts: [`syntaxTokens≈${countMatches(text, /\b(function|class|const|let|var|if|for|while|switch|return)\b/g)}`, `maxBraceDepth=${maxBraceDepth(text)}`],
  };
}

function maxElementDepth(element: Element | null, depth = 0): number {
  if (!element) return depth;
  return [...element.children].reduce((max, child) => Math.max(max, maxElementDepth(child, depth + 1)), depth);
}

function maxBraceDepth(text: string): number {
  let depth = 0;
  let maxDepth = 0;
  for (const character of text) {
    if (character === "{") maxDepth = Math.max(maxDepth, ++depth);
    if (character === "}") depth = Math.max(0, depth - 1);
  }
  return maxDepth;
}

export function extractCssSelectors(text: string): string[] {
  return [...text.matchAll(/([^{}]+)\{/g)]
    .flatMap((match) => match[1].split(","))
    .map((selector) => selector.trim())
    .filter((selector) => selector && !selector.startsWith("@"));
}

export function extractDomSelectors(text: string): string[] {
  return [
    ...[...text.matchAll(/querySelector(?:All)?\(["'`]([^"'`]+)["'`]\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/getElementById\(["'`]([^"'`]+)["'`]\)/g)].map((match) => `#${match[1]}`),
    ...[...text.matchAll(/getElementsByClassName\(["'`]([^"'`]+)["'`]\)/g)].map((match) => `.${match[1]}`),
  ];
}

function extractSymbols(text: string): string[] {
  return [
    ...text.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g),
    ...text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1]);
}

export function buildClusters(analyses: ClientFileAnalysis[]) {
  const clusters = new Map<string, { name: string; files: number; lines: number; riskScore: number }>();
  for (const analysis of analyses) {
    const name = analysis.path.split("/")[0] ?? "root";
    const cluster = clusters.get(name) ?? { name, files: 0, lines: 0, riskScore: 0 };
    cluster.files += 1;
    cluster.lines += analysis.lines;
    cluster.riskScore += analysis.riskScore;
    clusters.set(name, cluster);
  }

  return [...clusters.values()].sort((a, b) => b.riskScore - a.riskScore);
}

export function repeatedValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

export function summarizeParserFacts(analyses: ClientFileAnalysis[]): string[] {
  const html = analyses.filter((analysis) => analysis.extension === ".html");
  const css = analyses.filter((analysis) => analysis.extension === ".css");
  const scripts = analyses.filter((analysis) => isScriptPath(analysis.path));
  const sampleHtml = html
    .slice()
    .sort((a, b) => b.tree.nodes - a.tree.nodes)
    .slice(0, 3)
    .map((analysis) => `${analysis.path}: ${analysis.tree.facts.join("; ")}`);

  return [
    `html=${html.length.toLocaleString()} DOMParser`,
    `css=${css.length.toLocaleString()} text`,
    `js/ts=${scripts.length.toLocaleString()} text`,
    ...sampleHtml,
  ];
}

export function sum(items: ClientFileAnalysis[], key: "lines" | "riskScore"): number {
  return items.reduce((total, item) => total + item[key], 0);
}
