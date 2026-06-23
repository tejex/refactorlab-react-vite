import type { ZipTextFile } from "./browserZip";
import type { DeadCodeCandidate, DeadCodeMap, ProjectIntegrityMap } from "./types";
import { isScriptPath, normalizeAssetPath, countLines } from "./scannerUtils";
import { resolveJsTsModuleReference } from "./jsTsModuleMap";
import { extractHtmlBaseHref, resolveProjectReference, unresolvedProjectPath } from "./projectReferenceResolver";
export { buildDuplicateCssMap } from "./duplicateCssMap";

export function buildDeadCodeMap(files: ZipTextFile[]): DeadCodeMap {
  const allPaths = new Set(files.map((file) => normalizeAssetPath(file.path)));
  const byPath = new Map(files.map((file) => [normalizeAssetPath(file.path), file]));
  const entrypoints = files
    .map((file) => normalizeAssetPath(file.path))
    .filter((path) => path.endsWith(".html"))
    .sort();
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    const path = normalizeAssetPath(file.path);
    const baseHref = path.endsWith(".html") ? extractHtmlBaseHref(file.text) : null;
    const references = extractFileReferences(file);
    const resolvedReferences = references
      .map((reference) => resolveReferenceFromFile(path, reference, allPaths, baseHref))
      .filter((reference): reference is string => Boolean(reference));

    graph.set(path, new Set(resolvedReferences));
  }

  const reachable = walkReachable(entrypoints, graph);
  const unreachableFiles = [...allPaths]
    .filter((path) => !reachable.has(path))
    .filter((path) => !entrypoints.includes(path))
    .map((path): DeadCodeCandidate => ({
      path,
      kind: deadCodeKind(path),
      confidence: deadCodeConfidence(path, byPath.get(path)?.text ?? ""),
      reason: deadCodeReason(path),
      lines: countLines(byPath.get(path)?.text ?? ""),
    }))
    .sort((a, b) => confidenceRank(a.confidence) - confidenceRank(b.confidence) || a.path.localeCompare(b.path));

  return {
    entrypoints,
    reachableFiles: [...reachable].sort(),
    unreachableFiles,
  };
}

export function buildProjectIntegrityMap(files: ZipTextFile[], projectPaths: string[]): ProjectIntegrityMap {
  const allPaths = new Set(projectPaths.map(normalizeAssetPath));
  const missingByKey = new Map<string, ProjectIntegrityMap["missingReferences"][number]>();

  for (const file of files) {
    const sourceFile = normalizeAssetPath(file.path);
    const baseHref = sourceFile.endsWith(".html") ? extractHtmlBaseHref(file.text) : null;
    const references = extractTypedFileReferences(file);

    for (const reference of references) {
      if (!shouldCheckReference(reference.raw, sourceFile)) continue;
      const resolvedReference =
        reference.kind === "import"
          ? resolveJsTsModuleReference(sourceFile, reference.raw, allPaths)
          : resolveProjectReference(sourceFile, reference.raw, allPaths, baseHref);
      if (resolvedReference) continue;

      const missingPath = unresolvedProjectPath(sourceFile, reference.raw, baseHref);
      if (!missingPath) continue;

      const key = `${sourceFile}::${missingPath}::${reference.kind}`;
      missingByKey.set(key, {
        sourceFile,
        missingPath,
        kind: reference.kind,
      });
    }
  }

  return {
    missingReferences: [...missingByKey.values()].sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.missingPath.localeCompare(b.missingPath)),
  };
}

interface TypedFileReference {
  raw: string;
  kind: ProjectIntegrityMap["missingReferences"][number]["kind"];
}

function extractTypedFileReferences(file: ZipTextFile): TypedFileReference[] {
  const path = normalizeAssetPath(file.path);
  const text = file.text;

  if (path.endsWith(".html")) {
    return [
      ...extractHtmlReferences(text, "script", "src", "script"),
      ...extractHtmlReferences(text, "link", "href", "style"),
      ...extractHtmlReferences(text, "img", "src", "image"),
      ...extractHtmlReferences(text, "source", "src", "asset"),
      ...extractHtmlReferences(text, "video", "src", "asset"),
      ...extractHtmlReferences(text, "audio", "src", "asset"),
      ...extractHtmlReferences(text, "a", "href", "page"),
    ];
  }

  if (path.endsWith(".css")) {
    return [
      ...[...text.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)["']?\)?/gi)].map((match) => ({
        raw: match[1],
        kind: "style" as const,
      })),
      ...[...text.matchAll(/url\(["']?([^"')]+)["']?\)/gi)].map((match) => ({
        raw: match[1],
        kind: "asset" as const,
      })),
    ];
  }

  if (isScriptPath(path)) {
    return [
      ...[...text.matchAll(/\bimport\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g)].map((match) => ({
        raw: match[1],
        kind: "import" as const,
      })),
      ...[...text.matchAll(/\bimport\(["']([^"']+)["']\)/g)].map((match) => ({
        raw: match[1],
        kind: "import" as const,
      })),
      ...[...text.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map((match) => ({
        raw: match[1],
        kind: "import" as const,
      })),
    ];
  }

  return [];
}

function extractHtmlReferences(
  text: string,
  tag: string,
  attr: string,
  kind: TypedFileReference["kind"],
): TypedFileReference[] {
  return [...text.matchAll(new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`, "gi"))].map((match) => ({
    raw: match[1],
    kind,
  }));
}

function shouldCheckReference(rawReference: string, fromPath: string): boolean {
  const reference = rawReference.trim();

  if (
    !reference ||
    reference.startsWith("#") ||
    /^(https?:)?\/\//i.test(reference) ||
    /^(data|mailto|tel|javascript|blob):/i.test(reference)
  ) {
    return false;
  }

  if (isScriptPath(fromPath) && !reference.startsWith(".") && !reference.startsWith("/")) {
    return false;
  }

  const cleanReference = reference.split(/[?#]/)[0] ?? "";
  if (!cleanReference) return false;

  if (!/\.[a-z0-9]+$/i.test(cleanReference) && !reference.startsWith(".") && !reference.startsWith("/")) {
    return false;
  }

  return true;
}

function extractFileReferences(file: ZipTextFile): string[] {
  const path = normalizeAssetPath(file.path);
  const text = file.text;

  if (path.endsWith(".html")) {
    return [
      ...extractAttrValues(text, "href"),
      ...extractAttrValues(text, "src"),
      ...extractAttrValues(text, "data-src"),
    ];
  }

  if (path.endsWith(".css")) {
    return [
      ...[...text.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)["']?\)?/gi)].map((match) => match[1]),
      ...[...text.matchAll(/url\(["']?([^"')]+)["']?\)/gi)].map((match) => match[1]),
    ];
  }

  if (isScriptPath(path)) {
    return [
      ...[...text.matchAll(/\bimport\s+(?:[^"'()]+?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]),
      ...[...text.matchAll(/\bimport\(["']([^"']+)["']\)/g)].map((match) => match[1]),
      ...[...text.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map((match) => match[1]),
    ];
  }

  return [];
}

function extractAttrValues(text: string, attr: string): string[] {
  return [...text.matchAll(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "gi"))].map((match) => match[1]);
}

function walkReachable(entrypoints: string[], graph: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const stack = [...entrypoints];

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }

  return visited;
}

function deadCodeKind(path: string): DeadCodeCandidate["kind"] {
  if (path.endsWith(".css")) return "style";
  if (isScriptPath(path)) return "script";
  if (path.endsWith(".html")) return "page";
  return "source";
}

function deadCodeConfidence(path: string, text: string): DeadCodeCandidate["confidence"] {
  if (path.endsWith(".css")) return "High";
  if (isScriptPath(path) && !/\b(window|document|customElements|addEventListener)\b/.test(text)) {
    return "High";
  }

  return "Review";
}

function deadCodeReason(path: string): string {
  if (path.endsWith(".css")) return "No HTML, CSS, or JS source reference was found.";
  if (isScriptPath(path)) return "No HTML script tag or module import reaches this file.";
  if (path.endsWith(".html")) return "No entrypoint or discovered link reaches this page.";
  return "No source reference was found from the project entrypoints.";
}

function confidenceRank(confidence: DeadCodeCandidate["confidence"]): number {
  return confidence === "High" ? 0 : 1;
}

function resolveReferenceFromFile(fromPath: string, rawReference: string, allPaths: Set<string>, baseHref: string | null): string | null {
  return isScriptPath(fromPath)
    ? resolveJsTsModuleReference(fromPath, rawReference, allPaths)
    : resolveProjectReference(fromPath, rawReference, allPaths, baseHref);
}
