import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ignoredDirs, sourceExtensions } from "./config.ts";
import { analyzeCss } from "./css-analyzer.ts";
import { analyzeHtml } from "./html-analyzer.ts";
import { analyzeScript } from "./script-analyzer.ts";
import { countSideEffects } from "./scoring.ts";
import type { FileAnalysis, SourceExtension } from "./types.ts";
import { countLines, countMatches, estimateNesting } from "./text-utils.ts";

export function analyzeProject(root: string): FileAnalysis[] {
  return walkSourceFiles(root)
    .map((filePath) => analyzeFile(filePath, root))
    .sort((a, b) => b.riskScore - a.riskScore);
}

function walkSourceFiles(root: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root)) {
    const entryPath = path.join(root, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      if (!ignoredDirs.has(entry)) files.push(...walkSourceFiles(entryPath));
      continue;
    }

    if (isSourceFile(entryPath)) files.push(entryPath);
  }

  return files;
}

function analyzeFile(filePath: string, root: string): FileAnalysis {
  const content = readFileSync(filePath, "utf8");
  const extension = path.extname(filePath) as SourceExtension;
  const analysis = createBaseAnalysis(filePath, root, content, extension);

  if (extension === ".html") return analyzeHtml(analysis, content);
  if (extension === ".css") return analyzeCss(analysis, content);
  return analyzeScript(analysis, content);
}

function createBaseAnalysis(filePath: string, root: string, content: string, extension: SourceExtension): FileAnalysis {
  return {
    path: path.relative(root, filePath),
    extension,
    lines: countLines(content),
    bytes: Buffer.byteLength(content),
    riskScore: 0,
    symbols: [],
    imports: [],
    selectors: [],
    eventHandlers: [],
    sideEffects: countSideEffects(content),
    complexity: {
      branches: countMatches(content, /\b(if|else if|switch|case|catch|for|while|do)\b|\?|&&|\|\|/g),
      nestingEstimate: estimateNesting(content),
      fanOut: 0,
    },
    notes: [],
  };
}

function isSourceFile(filePath: string): boolean {
  return sourceExtensions.has(path.extname(filePath) as SourceExtension);
}
