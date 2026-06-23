import { readZipProjectEntries, type ZipProjectEntry } from "./browserZip";
import { downloadZip, type ZipFileInput } from "./zipWriter";
import type { InlineAssetBlock, ProjectReport } from "./types";

export interface VerifiedRewriteAppliedChange {
  kind: "extract-inline-style" | "extract-inline-script";
  sourceFile: string;
  targetFile: string;
  lines: string;
  verification: "passed";
}

export interface VerifiedRewriteRejectedChange {
  sourceFile: string;
  targetFile: string | null;
  lines: string;
  reason: string;
}

export interface VerifiedRewriteManifest {
  source: string;
  generatedAt: string;
  engine: "verified-inline-extraction-v1";
  originalFilesPreserved: boolean;
  excludedOriginalFiles: string[];
  applied: VerifiedRewriteAppliedChange[];
  rejected: VerifiedRewriteRejectedChange[];
}

export interface VerifiedRewriteArchive {
  files: ZipFileInput[];
  manifest: VerifiedRewriteManifest;
}

const textEncoder = new TextEncoder();

export async function buildVerifiedRewriteArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<VerifiedRewriteArchive> {
  const safeBlocks = verifiedInlineExtractionBlocks(report);
  if (!safeBlocks.length) throw new Error("No verified inline extraction rewrites are available.");

  onLog(`rewriteCandidates=${safeBlocks.length.toLocaleString()}`);
  const project = await readZipProjectEntries(await archive.arrayBuffer(), onLog);
  const rewrite = buildVerifiedInlineExtractionRewrite(project.entries, report.sourceName, safeBlocks);

  if (!rewrite.manifest.applied.length) {
    throw new Error("No rewrite candidates passed verification.");
  }

  onLog(`rewriteApplied=${rewrite.manifest.applied.length.toLocaleString()}`);
  onLog(`rewriteRejected=${rewrite.manifest.rejected.length.toLocaleString()}`);
  onLog(`rewriteExcluded=${rewrite.manifest.excludedOriginalFiles.length.toLocaleString()}`);

  return rewrite;
}

export async function downloadVerifiedRewriteArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<VerifiedRewriteArchive> {
  const rewrite = await buildVerifiedRewriteArchive(archive, report, onLog);
  downloadZip(rewrite.files, "fixer-verified-rewrite.zip");
  return rewrite;
}

export function buildVerifiedInlineExtractionRewrite(
  entries: ZipProjectEntry[],
  sourceName: string,
  safeBlocks: InlineAssetBlock[],
): { files: ZipFileInput[]; manifest: VerifiedRewriteManifest } {
  const root = "fixer-verified-rewrite";
  const entriesByPath = new Map(entries.map((entry) => [normalizeRewritePath(entry.path), entry]));
  const rewrittenTextByPath = new Map<string, string>();
  const generatedTextByPath = new Map<string, string>();
  const applied: VerifiedRewriteAppliedChange[] = [];
  const rejected: VerifiedRewriteRejectedChange[] = [];
  const blocksBySource = groupBlocksBySource(safeBlocks);

  for (const [sourceFile, blocks] of blocksBySource) {
    const sourceEntry = entriesByPath.get(sourceFile);
    if (!sourceEntry?.text) {
      rejectAll(blocks, rejected, "Source file was not found as editable text.");
      continue;
    }

    let text = sourceEntry.text;
    const edits = [...blocks].sort((a, b) => b.lineStart - a.lineStart || b.lineEnd - a.lineEnd);

    for (const block of edits) {
      const targetFile = normalizeRewritePath(block.recommendedPath ?? "");
      const lines = lineRangeLabel(block);
      const targetExists = entriesByPath.has(targetFile) || generatedTextByPath.has(targetFile);
      if (!targetFile || !block.replacement) {
        rejected.push({ sourceFile, targetFile: targetFile || null, lines, reason: "Rewrite target or replacement tag was missing." });
        continue;
      }

      if (targetExists) {
        rejected.push({ sourceFile, targetFile, lines, reason: "Rewrite target already exists." });
        continue;
      }

      const range = sourceRangeForLines(text, block.lineStart, block.lineEnd);
      const rangeError = verifyInlineRange(range.raw, block.kind);
      if (rangeError) {
        rejected.push({ sourceFile, targetFile, lines, reason: rangeError });
        continue;
      }

      text = `${text.slice(0, range.start)}${formatReplacementForRange(block.replacement, range.raw)}${text.slice(range.end)}`;
      generatedTextByPath.set(targetFile, ensureTrailingNewline(block.content));
      applied.push({
        kind: block.kind === "style" ? "extract-inline-style" : "extract-inline-script",
        sourceFile,
        targetFile,
        lines,
        verification: "passed",
      });
    }

    rewrittenTextByPath.set(sourceFile, text);
  }

  const manifest: VerifiedRewriteManifest = {
    source: sourceName,
    generatedAt: new Date().toISOString(),
    engine: "verified-inline-extraction-v1",
    originalFilesPreserved: true,
    excludedOriginalFiles: entries.filter((entry) => !shouldIncludeOriginalEntryInRewritePackage(entry)).map((entry) => normalizeRewritePath(entry.path)),
    applied,
    rejected,
  };

  const files: ZipFileInput[] = entries.filter(shouldIncludeOriginalEntryInRewritePackage).map((entry) => {
    const normalizedPath = normalizeRewritePath(entry.path);
    const rewrittenText = rewrittenTextByPath.get(normalizedPath);
    return {
      path: `${root}/${normalizedPath}`,
      content: rewrittenText ? textEncoder.encode(rewrittenText) : entry.bytes,
    };
  });

  for (const [targetFile, content] of generatedTextByPath) {
    files.push({
      path: `${root}/${targetFile}`,
      content,
    });
  }

  files.push({
    path: `${root}/fixer-rewrite-manifest.json`,
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  return { files, manifest };
}

export function verifiedInlineExtractionBlocks(report: ProjectReport): InlineAssetBlock[] {
  const safeChangeKeys = new Set(
    (report.inlineAssetPlan?.guaranteedSafeChanges ?? []).map((change) =>
      safeChangeKey(change.file, change.kind, change.lineStart, change.lineEnd, change.targetPath),
    ),
  );

  return (report.inlineAssetPlan?.blocks ?? [])
    .filter((block) => block.safety !== "Low")
    .filter((block) => block.recommendedPath && block.replacement)
    .filter((block) => safeChangeKeys.has(safeChangeKey(block.file, block.kind, block.lineStart, block.lineEnd, block.recommendedPath ?? "")));
}

function groupBlocksBySource(blocks: InlineAssetBlock[]): Map<string, InlineAssetBlock[]> {
  const groups = new Map<string, InlineAssetBlock[]>();
  for (const block of blocks) {
    const sourceFile = normalizeRewritePath(block.file);
    groups.set(sourceFile, [...(groups.get(sourceFile) ?? []), block]);
  }
  return groups;
}

function rejectAll(blocks: InlineAssetBlock[], rejected: VerifiedRewriteRejectedChange[], reason: string) {
  for (const block of blocks) {
    rejected.push({
      sourceFile: normalizeRewritePath(block.file),
      targetFile: block.recommendedPath ? normalizeRewritePath(block.recommendedPath) : null,
      lines: lineRangeLabel(block),
      reason,
    });
  }
}

function sourceRangeForLines(text: string, lineStart: number, lineEnd: number): { start: number; end: number; raw: string } {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }

  const start = starts[Math.max(0, lineStart - 1)] ?? text.length;
  const end = starts[lineEnd] ?? text.length;
  return {
    start,
    end,
    raw: text.slice(start, end),
  };
}

function verifyInlineRange(raw: string, kind: InlineAssetBlock["kind"]): string | null {
  const tag = kind === "style" ? "style" : "script";
  const openingTag = raw.match(new RegExp(`<${tag}\\b[^>]*>`, "i"))?.[0] ?? null;
  if (!openingTag) return `Expected inline <${tag}> tag was not found at the planned range.`;
  if (!new RegExp(`</${tag}>`, "i").test(raw)) return `Closing </${tag}> tag was not found at the planned range.`;
  if (kind === "script" && hasTagAttribute(openingTag, "src")) return "External script tags are not rewritten by this engine.";
  return null;
}

function hasTagAttribute(openingTag: string, attribute: string): boolean {
  return new RegExp(`\\s${attribute}\\s*=`, "i").test(openingTag);
}

function formatReplacementForRange(replacement: string, raw: string): string {
  const indent = raw.match(/^\s*/)?.[0] ?? "";
  const trailingNewline = /\r?\n$/.test(raw) ? "\n" : "";
  return `${indent}${replacement}${trailingNewline}`;
}

function safeChangeKey(file: string, kind: string, lineStart: number, lineEnd: number, targetPath: string): string {
  return [normalizeRewritePath(file), kind, lineStart, lineEnd, normalizeRewritePath(targetPath)].join("::");
}

function lineRangeLabel(block: InlineAssetBlock): string {
  return block.lineStart === block.lineEnd ? `${block.lineStart}` : `${block.lineStart}-${block.lineEnd}`;
}

function normalizeRewritePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function shouldIncludeOriginalEntryInRewritePackage(entry: ZipProjectEntry): boolean {
  const path = normalizeRewritePath(entry.path);
  const parts = path.split("/").filter(Boolean);
  const lowerParts = parts.map((part) => part.toLowerCase());
  const fileName = lowerParts.at(-1) ?? "";
  if (fileName.startsWith(".codex-")) return false;
  if (fileName.startsWith("._")) return false;
  if (lowerParts.includes("__macosx")) return false;
  if (lowerParts.includes(".temp")) return false;
  if (fileName === ".ds_store" || fileName === "thumbs.db") return false;
  if (path === "test_file.txt" && entry.bytes.byteLength === 0) return false;
  return true;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
