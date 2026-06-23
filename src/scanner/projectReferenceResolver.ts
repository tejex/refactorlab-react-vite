import { dirname, joinProjectPath, normalizeAssetPath } from "./scannerUtils";

export function extractHtmlBaseHref(text: string): string | null {
  const match = text.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/i);
  return match?.[1] ?? null;
}

export function resolveProjectReference(
  fromPath: string,
  rawReference: string,
  allPaths: Set<string>,
  baseHref: string | null = null,
): string | null {
  const reference = rawReference.trim();
  if (isIgnoredReference(reference)) return null;

  const cleanReference = normalizeAssetPath(reference.split(/[?#]/)[0] ?? "");
  if (!cleanReference) return null;

  const basePath = browserLikeReferencePath(fromPath, reference, cleanReference, baseHref);
  return referenceCandidates(basePath).find((candidate) => allPaths.has(candidate)) ?? null;
}

export function unresolvedProjectPath(fromPath: string, rawReference: string, baseHref: string | null = null): string | null {
  const reference = rawReference.trim();
  if (isIgnoredReference(reference)) return null;

  const cleanReference = normalizeAssetPath(reference.split(/[?#]/)[0] ?? "");
  if (!cleanReference) return null;
  return browserLikeReferencePath(fromPath, reference, cleanReference, baseHref);
}

function browserLikeReferencePath(fromPath: string, rawReference: string, cleanReference: string, baseHref: string | null): string {
  if (rawReference.startsWith("/")) return cleanReference;
  if (baseHref && !rawReference.startsWith("#")) {
    const cleanBase = normalizeAssetPath(baseHref.split(/[?#]/)[0] ?? "");
    const baseDirectory = cleanBase && !cleanBase.endsWith("/") && /\.[a-z0-9]+$/i.test(cleanBase) ? dirname(cleanBase) : cleanBase;
    return joinProjectPath(baseDirectory, cleanReference);
  }
  return joinProjectPath(dirname(fromPath), cleanReference);
}

function referenceCandidates(path: string): string[] {
  const normalized = normalizeAssetPath(path);
  const candidates = [normalized];

  if (!/\.[a-z0-9]+$/i.test(normalized)) {
    candidates.push(`${normalized}.html`, `${normalized}/index.html`, `${normalized}.js`, `${normalized}.jsx`, `${normalized}.ts`, `${normalized}.tsx`, `${normalized}.css`);
  }

  if (normalized.endsWith("/")) candidates.push(`${normalized}index.html`);
  return [...new Set(candidates)];
}

function isIgnoredReference(reference: string): boolean {
  return (
    !reference ||
    reference.startsWith("#") ||
    /^(https?:)?\/\//i.test(reference) ||
    /^(data|mailto|tel|javascript|blob):/i.test(reference)
  );
}
