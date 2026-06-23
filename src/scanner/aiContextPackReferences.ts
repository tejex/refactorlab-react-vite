import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, GuaranteedSafeChange, ProjectReport } from "./types";
import {
  contextPackRoot,
  maxContextReferences,
  maxContextSnippets,
  maxSnippetChars,
  maxSnippetLines,
  type BuiltSourceReferences,
  type SourceIndexEntry,
  type SourceReferenceInput,
} from "./aiContextPackTypes";

export function buildSourceIndex(textFiles: ZipTextFile[]): SourceIndexEntry[] {
  return textFiles.map((file) => ({
    path: file.path,
    kind: sourceKind(file.path),
    bytes: file.bytes,
    lines: countLines(file.text),
  }));
}

export function buildSourceReferences(report: ProjectReport, sourceTextByPath: Map<string, string>): BuiltSourceReferences {
  const inputs = collectReferenceInputs(report).slice(0, maxContextReferences);
  const references: BuiltSourceReferences["references"] = [];
  const snippetFiles: BuiltSourceReferences["snippetFiles"] = [];

  dedupeReferences(inputs).forEach((input, index) => {
    const sourceFile = normalizePath(input.sourceFile);
    const text = sourceTextByPath.get(sourceFile);
    const lineCount = text ? countLines(text) : 0;
    const lineStart = clampLine(input.lineStart, lineCount);
    const lineEnd = clampLine(input.lineEnd, lineCount);
    const id = stableReferenceId(input);
    const shouldEmitSnippet = Boolean(text) && index < maxContextSnippets;
    const snippetPath = shouldEmitSnippet ? `${contextPackRoot}/source-snippets/${id}.txt` : null;

    if (shouldEmitSnippet && text) {
      snippetFiles.push({
        path: `${contextPackRoot}/source-snippets/${id}.txt`,
        content: snippetText(sourceFile, text, lineStart, lineEnd, input.reason),
      });
    }

    references.push({
      id,
      category: input.category,
      sourceFile,
      lineStart,
      lineEnd: Math.max(lineStart, lineEnd),
      reason: input.reason,
      sourceRef: `source://${sourceFile}#L${lineStart}-L${Math.max(lineStart, lineEnd)}`,
      snippetPath,
      available: Boolean(text),
    });
  });

  return { references, snippetFiles };
}

function collectReferenceInputs(report: ProjectReport): SourceReferenceInput[] {
  const conversionMap = report.reactConversionMap;
  const inputs: SourceReferenceInput[] = [];

  for (const packet of conversionMap?.routePackets ?? []) {
    inputs.push({
      category: "route-source",
      sourceFile: packet.sourceFile,
      lineStart: 1,
      lineEnd: 80,
      reason: `Route source for ${packet.routePath}`,
    });
  }
  for (const owner of conversionMap?.componentOwnership ?? []) {
    for (const locator of owner.locators) {
      inputs.push({
        category: "component-owner",
        sourceFile: locator.sourceFile,
        lineStart: locator.lineStart,
        lineEnd: locator.lineEnd,
        reason: `${owner.componentName} owner snippet for ${owner.selector}`,
      });
    }
  }
  for (const binding of conversionMap?.behaviorBindings ?? []) inputs.push(behaviorReferenceInput(binding));
  for (const change of report.inlineAssetPlan?.guaranteedSafeChanges ?? []) inputs.push(safeChangeReferenceInput(change));
  return inputs.sort(referenceSort);
}

function behaviorReferenceInput(binding: BehaviorBinding): SourceReferenceInput {
  return {
    category: "behavior-binding",
    sourceFile: binding.sourceFile,
    lineStart: Math.max(1, binding.line - 6),
    lineEnd: binding.line + 6,
    reason: `${binding.event} behavior for ${binding.selector}`,
  };
}

function safeChangeReferenceInput(change: GuaranteedSafeChange): SourceReferenceInput {
  return {
    category: "verified-rewrite",
    sourceFile: change.file,
    lineStart: change.lineStart,
    lineEnd: change.lineEnd,
    reason: `Parser-verified ${change.kind} extraction to ${change.targetPath}`,
  };
}

function dedupeReferences(inputs: SourceReferenceInput[]): SourceReferenceInput[] {
  const seen = new Set<string>();
  const output: SourceReferenceInput[] = [];
  for (const input of inputs) {
    const key = `${input.category}:${normalizePath(input.sourceFile)}:${input.lineStart}:${input.lineEnd}:${input.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(input);
  }
  return output;
}

function referenceSort(left: SourceReferenceInput, right: SourceReferenceInput): number {
  return referenceRank(left) - referenceRank(right) || left.sourceFile.localeCompare(right.sourceFile) || left.lineStart - right.lineStart;
}

function referenceRank(input: SourceReferenceInput): number {
  if (input.category === "route-source") return 0;
  if (input.category === "component-owner") return 1;
  if (input.category === "behavior-binding") return 2;
  return 3;
}

function snippetText(sourceFile: string, text: string, lineStart: number, lineEnd: number, reason: string): string {
  const lines = text.split(/\r\n|\r|\n/);
  const startIndex = Math.max(0, lineStart - 1);
  const endIndex = Math.min(lines.length, Math.max(lineStart, lineEnd));
  const limitedEnd = Math.min(endIndex, startIndex + maxSnippetLines);
  const body = lines.slice(startIndex, limitedEnd).map((line, index) => `L${startIndex + index + 1}: ${line}`).join("\n");
  const cappedBody = body.length > maxSnippetChars ? `${body.slice(0, maxSnippetChars)}\n[snippet capped]\n` : body;

  return ensureTrailingNewline(`# ${sourceFile}
Reason: ${reason}
Lines: ${lineStart}-${Math.max(lineStart, lineEnd)}

${cappedBody}`);
}

function sourceKind(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".html")) return "page";
  if (lowerPath.endsWith(".css")) return "style";
  if (/\.(js|jsx|mjs|cjs)$/.test(lowerPath)) return "script";
  if (/\.(ts|tsx|mts|cts)$/.test(lowerPath)) return "typescript";
  if (lowerPath.endsWith(".json")) return "data";
  return "source";
}

function stableReferenceId(input: SourceReferenceInput): string {
  return hashString(`${input.category}:${normalizePath(input.sourceFile)}:${input.lineStart}:${input.lineEnd}:${input.reason}`);
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function clampLine(line: number, lineCount: number): number {
  if (!lineCount) return Math.max(1, line);
  return Math.min(lineCount, Math.max(1, line));
}

function normalizePath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
