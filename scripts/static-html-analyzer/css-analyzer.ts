import postcss from "postcss";
import { scoreFile } from "./scoring.ts";
import type { FileAnalysis, TreeSummary } from "./types.ts";
import { unique } from "./text-utils.ts";

export function analyzeCss(analysis: FileAnalysis, content: string): FileAnalysis {
  const root = postcss.parse(content, { from: analysis.path });
  const selectors: string[] = [];
  let mediaQueries = 0;
  let customProperties = 0;

  root.walkRules((rule) => {
    selectors.push(...rule.selector.split(",").map((selector) => selector.trim()).filter(Boolean));
  });
  root.walkAtRules("media", () => {
    mediaQueries += 1;
  });
  root.walkDecls(/^--[a-z0-9-]+$/i, () => {
    customProperties += 1;
  });

  analysis.selectors = unique(selectors).slice(0, 120);
  analysis.symbols = analysis.selectors.slice(0, 60);
  analysis.tree = summarizeCssTree(root);
  analysis.complexity.branches = mediaQueries;
  analysis.complexity.fanOut = customProperties;
  analysis.riskScore = scoreFile(analysis, {
    sizeWeight: 0.8,
    extra: selectors.length * 0.35 + mediaQueries * 4,
  });

  addCssNotes(analysis, customProperties);
  return analysis;
}

function summarizeCssTree(root: postcss.Root): TreeSummary {
  const counts = new Map<string, number>();
  let nodes = 0;
  let maxDepth = 0;

  root.walk((node) => {
    nodes += 1;
    maxDepth = Math.max(maxDepth, getCssDepth(node));
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  });

  return {
    parser: "postcss",
    nodes,
    maxDepth,
    topNodeTypes: [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function getCssDepth(node: postcss.Node): number {
  let depth = 0;
  let current = node.parent;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function addCssNotes(analysis: FileAnalysis, customProperties: number): void {
  if (analysis.lines > 800) analysis.notes.push("Large stylesheet; likely contains multiple visual modules.");
  if (customProperties > 30) analysis.notes.push("Theme tokens may deserve a separate theme module.");
}
