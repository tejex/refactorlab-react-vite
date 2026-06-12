import { parse } from "parse5";
import { scoreFile } from "./scoring.ts";
import type { FileAnalysis, TreeSummary } from "./types.ts";
import { splitClassList, unique } from "./text-utils.ts";

interface HtmlElementFact {
  tagName: string;
  attrs: Record<string, string>;
}

export function analyzeHtml(analysis: FileAnalysis, content: string): FileAnalysis {
  const document = parse(content);
  const elements = collectElements(document);
  const scripts = elements.filter((element) => element.tagName === "script" && element.attrs.src).map((element) => element.attrs.src);
  const inlineScripts = elements.filter((element) => element.tagName === "script" && !element.attrs.src);
  const stylesheets = elements
    .filter((element) => element.tagName === "link" && element.attrs.rel === "stylesheet" && element.attrs.href)
    .map((element) => element.attrs.href);
  const ids = elements.map((element) => element.attrs.id).filter(Boolean);
  const classes = elements.flatMap((element) => splitClassList(element.attrs.class ?? ""));
  const inlineHandlers = elements.flatMap((element) =>
    Object.keys(element.attrs)
      .filter((name) => /^on[a-z]+$/i.test(name))
      .map((name) => name.slice(2).toLowerCase()),
  );
  const structuralBlocks = elements.filter((element) => /^(header|nav|footer|aside|main|section)$/.test(element.tagName)).length;

  analysis.symbols = unique(["html-document", ...ids.map((id) => `#${id}`)]);
  analysis.imports = [...scripts, ...stylesheets];
  analysis.selectors = unique([...ids.map((id) => `#${id}`), ...classes.map((className) => `.${className}`)]).slice(0, 80);
  analysis.eventHandlers = inlineHandlers.map((eventName) => `on${eventName}`);
  analysis.tree = summarizeHtmlTree(document);
  analysis.complexity.fanOut = scripts.length + stylesheets.length;
  analysis.riskScore = scoreFile(analysis, {
    sizeWeight: 1.2,
    extra: inlineScripts.length * 18 + inlineHandlers.length * 10 + structuralBlocks * 2,
  });

  addHtmlNotes(analysis, scripts.length, inlineScripts.length, inlineHandlers.length);
  return analysis;
}

function collectElements(node: unknown): HtmlElementFact[] {
  const elements: HtmlElementFact[] = [];
  visitHtml(node, (current) => {
    if (typeof current.tagName !== "string") return;
    const attrs = Array.isArray(current.attrs) ? current.attrs : [];
    elements.push({
      tagName: current.tagName,
      attrs: Object.fromEntries(attrs.map((attr) => [attr.name, attr.value])),
    });
  });
  return elements;
}

function summarizeHtmlTree(node: unknown): TreeSummary {
  const counts = new Map<string, number>();
  let nodes = 0;
  let maxDepth = 0;

  visitHtml(node, (current, depth) => {
    const type = typeof current.tagName === "string" ? current.tagName : String(current.nodeName ?? "unknown");
    nodes += 1;
    maxDepth = Math.max(maxDepth, depth);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });

  return {
    parser: "parse5",
    nodes,
    maxDepth,
    topNodeTypes: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function visitHtml(node: unknown, callback: (node: Record<string, unknown>, depth: number) => void, depth = 0): void {
  if (!isHtmlNode(node)) return;
  callback(node, depth);

  const childNodes = node.childNodes;
  if (Array.isArray(childNodes)) {
    for (const child of childNodes) visitHtml(child, callback, depth + 1);
  }
}

function isHtmlNode(value: unknown): value is Record<string, unknown> & { attrs?: Array<{ name: string; value: string }> } {
  return Boolean(value) && typeof value === "object";
}

function addHtmlNotes(analysis: FileAnalysis, scripts: number, inlineScripts: number, inlineHandlers: number): void {
  if (scripts > 3) analysis.notes.push("HTML page depends on several scripts; extraction should preserve load order.");
  if (inlineScripts > 0) analysis.notes.push("Inline scripts couple markup and behavior.");
  if (inlineHandlers > 0) analysis.notes.push("Inline event handlers make DOM behavior harder to move safely.");
}
