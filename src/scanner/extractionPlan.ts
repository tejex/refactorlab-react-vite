import type { ZipTextFile } from "./browserZip";
import type { ExternalAssetOrder, GuaranteedSafeChange, InlineAssetBlock, InlineAssetPlan } from "./types";
import { countMatches, normalizeAssetPath } from "./scannerUtils";

export function buildInlineAssetPlan(files: ZipTextFile[]): InlineAssetPlan {
  const htmlFiles = files.filter((file) => file.path.endsWith(".html"));
  const existingPaths = new Set(files.map((file) => normalizeAssetPath(file.path)));
  const blocks = htmlFiles.flatMap(findInlineAssetBlocks);
  const sourceLineCounts = new Map(htmlFiles.map((file) => [file.path, file.text.split(/\r\n|\r|\n/).length]));
  const guaranteedSafeChanges = findGuaranteedSafeChanges(blocks, existingPaths, sourceLineCounts);
  const externalOrder = htmlFiles.map(findExternalAssetOrder).filter((order) => order.stylesheets.length > 0 || order.scripts.length > 0);

  return {
    blocks: blocks.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file)),
    guaranteedSafeChanges,
    externalOrder,
  };
}

function findGuaranteedSafeChanges(blocks: InlineAssetBlock[], existingPaths: Set<string>, sourceLineCounts: Map<string, number>): GuaranteedSafeChange[] {
  const targetCounts = new Map<string, number>();
  for (const block of blocks) {
    if (!block.recommendedPath) continue;
    const targetPath = normalizeAssetPath(block.recommendedPath);
    targetCounts.set(targetPath, (targetCounts.get(targetPath) ?? 0) + 1);
  }

  return blocks
    .filter((block) => {
      if (!block.recommendedPath) return false;
      const targetPath = normalizeAssetPath(block.recommendedPath);
      return !existingPaths.has(targetPath) && targetCounts.get(targetPath) === 1;
    })
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file))
    .map((block) => ({
      file: block.file,
      kind: block.kind,
      lineStart: block.lineStart,
      lineEnd: block.lineEnd,
      sourceLines: sourceLineCounts.get(block.file) ?? block.lineEnd,
      targetPath: block.recommendedPath ?? "",
      action: "copy-only",
      content: block.content,
    }));
}

function findInlineAssetBlocks(file: ZipTextFile): InlineAssetBlock[] {
  const blocks: InlineAssetBlock[] = [];
  const bodyIndex = findBodyIndex(file.text);
  let styleIndex = 0;
  let scriptIndex = 0;

  for (const match of file.text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)) {
    const fullMatch = match[0];
    const startIndex = match.index ?? 0;
    const content = stripTagWrapper(fullMatch, "style");
    styleIndex += 1;
    blocks.push(buildInlineBlock(file.path, file.text, "style", styleIndex, startIndex, fullMatch, content, bodyIndex));
  }

  for (const match of file.text.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)) {
    const attrs = match[1] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;

    const fullMatch = match[0];
    const startIndex = match.index ?? 0;
    const content = stripTagWrapper(fullMatch, "script");
    scriptIndex += 1;
    blocks.push(buildInlineBlock(file.path, file.text, "script", scriptIndex, startIndex, fullMatch, content, bodyIndex, attrs));
  }

  return blocks;
}

function buildInlineBlock(
  filePath: string,
  fileText: string,
  kind: "style" | "script",
  index: number,
  startIndex: number,
  fullMatch: string,
  content: string,
  bodyIndex: number,
  attrs = "",
): InlineAssetBlock {
  const lineStart = lineNumberAt(fileText, startIndex);
  const lineEnd = lineStart + countMatches(fullMatch, /\n/g);
  const location = bodyIndex >= 0 && startIndex > bodyIndex ? "body" : "head";
  const lines = Math.max(1, countNonEmptyLines(content));
  const safety = scoreExtractionSafety(kind, location, content);
  const recommendedPath = safety === "Low" ? null : recommendedExtractionPath(filePath, kind, index, lines);
  const replacement = recommendedPath ? buildReplacementTag(kind, recommendedPath, attrs) : null;

  return {
    file: filePath,
    kind,
    location,
    index,
    lineStart,
    lineEnd,
    lines,
    safety,
    recommendedPath,
    replacement,
    warnings: [],
    content: trimOuterBlankLines(content),
  };
}

export function findExternalAssetOrder(file: ZipTextFile): ExternalAssetOrder {
  const bodyIndex = findBodyIndex(file.text);
  const stylesheetLinks = [...file.text.matchAll(/<link\b[^>]*>/gi)].filter((match) => extractAttr(match[0], "rel")?.toLowerCase() === "stylesheet");
  const stylesheets = stylesheetLinks
    .map((match, index) => formatAssetOrderItem(index + 1, extractAttr(match[0], "href"), bodyIndex, match.index ?? 0))
    .filter((item) => item.length > 0);
  const scripts = [...file.text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map((match, index) => formatAssetOrderItem(index + 1, match[1], bodyIndex, match.index ?? 0))
    .filter((item) => item.length > 0);

  return {
    file: file.path,
    stylesheets,
    scripts,
  };
}

function scoreExtractionSafety(kind: "style" | "script", location: "head" | "body", content: string): "High" | "Medium" | "Low" {
  if (kind === "style") return "High";
  if (location === "head" && /localStorage|sessionStorage|document\.documentElement|matchMedia|theme/i.test(content)) return "Low";
  if (/DOMContentLoaded|defer|querySelector|getElementById|addEventListener|fetch|Stripe|supabase|firebase/i.test(content)) return "Medium";
  return location === "head" ? "Low" : "Medium";
}

function recommendedExtractionPath(filePath: string, kind: "style" | "script", index: number, lines: number): string {
  const slash = filePath.lastIndexOf("/");
  const directory = slash >= 0 ? filePath.slice(0, slash) : "";
  const filename = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const basename = filename.replace(/\.html$/i, "");
  const prefix = directory ? `/${directory}` : "";

  if (kind === "style") return `${prefix}/${basename}${index === 1 ? "" : `-${index}`}.css`;
  if (index === 1 || lines > 80) return `${prefix}/${basename}-page.js`;
  return `${prefix}/${basename}-inline-${index}.js`;
}

function buildReplacementTag(kind: "style" | "script", recommendedPath: string, attrs: string): string {
  if (kind === "style") return `<link rel="stylesheet" href="${recommendedPath}">`;
  const typeModule = /\btype\s*=\s*["']module["']/i.test(attrs) ? ` type="module"` : "";
  return `<script${typeModule} src="${recommendedPath}"></script>`;
}

function stripTagWrapper(fullMatch: string, tag: "style" | "script"): string {
  return fullMatch.replace(new RegExp(`^<${tag}\\b[^>]*>`, "i"), "").replace(new RegExp(`</${tag}>$`, "i"), "");
}

function findBodyIndex(text: string): number {
  return text.search(/<body\b/i);
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\n/).length;
}

function countNonEmptyLines(text: string): number {
  return text.split(/\r\n|\r|\n/).filter((line) => line.trim()).length;
}

function trimOuterBlankLines(text: string): string {
  return text.replace(/^\s*\r?\n/, "").replace(/\r?\n\s*$/, "\n");
}

function extractAttr(text: string, attr: string): string | null {
  return text.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? null;
}

function formatAssetOrderItem(index: number, source: string | null, bodyIndex: number, tagIndex: number): string {
  const location = bodyIndex >= 0 && tagIndex > bodyIndex ? "body" : "head";
  return source ? `${index}. ${source} (${location})` : "";
}

export function extractInlineStyleTexts(text: string): string[] {
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
}

export function normalizeCssSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}
