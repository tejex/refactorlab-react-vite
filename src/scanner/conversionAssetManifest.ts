import { dirname, joinProjectPath, normalizeAssetPath } from "./scannerUtils";
import type { VerifiedRewriteArchive } from "./verifiedRewriteEngine";
import type { MissingReference, ProjectReport } from "./types";

export interface ConversionAssetManifest {
  packageMode: "llm-slim";
  purpose: string;
  publicRoot: "public/";
  assetCount: number;
  referencedRouteCount: number;
  missingAssetReferences: ConversionMissingAssetReference[];
  assets: ConversionAssetManifestItem[];
}

export interface ConversionAssetManifestItem {
  sourceAsset: string;
  copyTo: string;
  publicUrl: string;
  kind: ConversionAssetKind;
  availableFrom: string[];
  usedByRoutes: string[];
  referencedBy: string[];
  componentOwners: string[];
  note: string;
}

export interface ConversionMissingAssetReference {
  sourceFile: string;
  missingPath: string;
  kind: MissingReference["kind"];
}

type ConversionAssetKind = "image" | "video" | "audio" | "font" | "document" | "data" | "other";

const textDecoder = new TextDecoder();

export function buildConversionAssetManifest(report: ProjectReport, verifiedRewrite: VerifiedRewriteArchive | null = null): ConversionAssetManifest {
  const assets = new Map<string, ConversionAssetManifestItem>();
  const routeBySource = new Map((report.reactConversionMap?.routePackets ?? []).map((packet) => [packet.sourceFile, packet.routePath]));

  if (verifiedRewrite) addVerifiedRewriteAssets(assets, verifiedRewrite, routeBySource);

  for (const packet of report.reactConversionMap?.routePackets ?? []) {
    for (const rawAsset of packet.assets) {
      const sourceAsset = normalizeAssetPath(rawAsset);
      if (!sourceAsset) continue;

      const item = assetItem(assets, sourceAsset);

      item.usedByRoutes.push(packet.routePath);
      item.referencedBy.push(packet.sourceFile);
      for (const owner of packet.componentOwners) {
        if (owner.assets.includes(rawAsset) || owner.assets.includes(sourceAsset)) item.componentOwners.push(owner.componentName);
      }
      assets.set(sourceAsset, item);
    }
  }

  const normalizedAssets = [...assets.values()]
    .map((asset) => ({
      ...asset,
      usedByRoutes: uniqueSorted(asset.usedByRoutes),
      referencedBy: uniqueSorted(asset.referencedBy),
      componentOwners: uniqueSorted(asset.componentOwners),
    }))
    .sort((a, b) => a.sourceAsset.localeCompare(b.sourceAsset));

  return {
    packageMode: "llm-slim",
    purpose: "Asset copy plan for restoring omitted static files during framework conversion.",
    publicRoot: "public/",
    assetCount: normalizedAssets.length,
    referencedRouteCount: new Set(normalizedAssets.flatMap((asset) => asset.usedByRoutes)).size,
    missingAssetReferences: missingAssetReferences(report),
    assets: normalizedAssets,
  };
}

function addVerifiedRewriteAssets(
  assets: Map<string, ConversionAssetManifestItem>,
  verifiedRewrite: VerifiedRewriteArchive,
  routeBySource: Map<string, string>,
) {
  const htmlFiles = new Map<string, string>();
  const cssFiles = new Map<string, string>();
  const stylesheetRoutes = new Map<string, Set<string>>();

  for (const file of verifiedRewrite.files) {
    const sourcePath = stripRewriteRoot(file.path);
    if (isCopyAssetPath(sourcePath)) assetItem(assets, sourcePath);
    if (sourcePath.endsWith(".html")) htmlFiles.set(sourcePath, decodeTextFile(file.content));
    if (sourcePath.endsWith(".css")) cssFiles.set(sourcePath, decodeTextFile(file.content));
  }

  for (const [htmlPath, html] of htmlFiles) {
    const routePath = routeBySource.get(htmlPath) ?? routePathForHtml(htmlPath);
    for (const reference of extractHtmlReferences(html)) {
      const resolved = resolveAssetReference(reference, htmlPath);
      if (!resolved) continue;
      if (resolved.endsWith(".css")) {
        const routes = stylesheetRoutes.get(resolved) ?? new Set<string>();
        routes.add(routePath);
        stylesheetRoutes.set(resolved, routes);
      }
      if (!isAssetReferencePath(resolved)) continue;
      const item = assetItem(assets, resolved);
      item.usedByRoutes.push(routePath);
      item.referencedBy.push(htmlPath);
    }
  }

  for (const [cssPath, css] of cssFiles) {
    const routes = [...(stylesheetRoutes.get(cssPath) ?? [])];
    for (const reference of extractCssUrlReferences(css)) {
      const resolved = resolveAssetReference(reference, cssPath);
      if (!resolved || !isAssetReferencePath(resolved)) continue;
      const item = assetItem(assets, resolved);
      item.usedByRoutes.push(...routes);
      item.referencedBy.push(cssPath);
    }
  }
}

function assetItem(assets: Map<string, ConversionAssetManifestItem>, sourceAsset: string): ConversionAssetManifestItem {
  const normalized = normalizeAssetPath(sourceAsset);
  const existing = assets.get(normalized);
  if (existing) return existing;

  const item: ConversionAssetManifestItem = {
    sourceAsset: normalized,
    copyTo: `public/${normalized}`,
    publicUrl: `/${normalized}`,
    kind: assetKind(normalized),
    availableFrom: ["original project archive", "fixer-verified-rewrite.zip"],
    usedByRoutes: [],
    referencedBy: [],
    componentOwners: [],
    note: "Copy this file into the Next.js public folder. Reference it with publicUrl.",
  };
  assets.set(normalized, item);
  return item;
}

function extractHtmlReferences(text: string): string[] {
  return [
    ...attributeValues(text, "src"),
    ...attributeValues(text, "href"),
    ...attributeValues(text, "poster"),
    ...attributeValues(text, "data-src"),
    ...attributeValues(text, "srcset").flatMap(srcsetValues),
  ];
}

function attributeValues(text: string, attribute: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "gi");
  for (const match of text.matchAll(pattern)) values.push(match[1] ?? "");
  return values;
}

function srcsetValues(srcset: string): string[] {
  return srcset.split(",").map((item) => item.trim().split(/\s+/)[0] ?? "").filter(Boolean);
}

function extractCssUrlReferences(text: string): string[] {
  const references: string[] = [];
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) references.push(match[1] ?? "");
  return references;
}

function resolveAssetReference(reference: string, sourceFile: string): string | null {
  if (!reference || reference.startsWith("#") || /^(https?:)?\/\//i.test(reference) || /^(data|mailto|tel|javascript|blob):/i.test(reference)) {
    return null;
  }

  const cleanReference = normalizeAssetPath(reference.split(/[?#]/)[0] ?? "");
  if (!cleanReference) return null;
  return reference.startsWith("/") ? cleanReference : joinProjectPath(dirname(sourceFile), cleanReference);
}

function missingAssetReferences(report: ProjectReport): ConversionMissingAssetReference[] {
  return (report.integrityMap?.missingReferences ?? [])
    .filter((reference) => reference.kind === "image" || reference.kind === "asset")
    .map((reference) => ({
      sourceFile: reference.sourceFile,
      missingPath: reference.missingPath,
      kind: reference.kind,
    }))
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile) || a.missingPath.localeCompare(b.missingPath));
}

function assetKind(path: string): ConversionAssetKind {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (["avif", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["m4v", "mov", "mp4", "ogv", "webm"].includes(extension)) return "video";
  if (["aac", "flac", "m4a", "mp3", "oga", "ogg", "wav"].includes(extension)) return "audio";
  if (["eot", "otf", "ttf", "woff", "woff2"].includes(extension)) return "font";
  if (["pdf"].includes(extension)) return "document";
  if (["csv", "json", "xml"].includes(extension)) return "data";
  return "other";
}

function isCopyAssetPath(path: string): boolean {
  return /\.(avif|gif|ico|jpe?g|png|svg|webp|m4v|mov|mp4|ogv|webm|aac|flac|m4a|mp3|oga|ogg|wav|eot|otf|ttf|woff2?|pdf)$/i.test(path);
}

function isAssetReferencePath(path: string): boolean {
  return /\.(avif|gif|ico|jpe?g|png|svg|webp|m4v|mov|mp4|ogv|webm|aac|flac|m4a|mp3|oga|ogg|wav|eot|otf|ttf|woff2?|pdf|csv|json|xml)$/i.test(path);
}

function stripRewriteRoot(path: string): string {
  return normalizeAssetPath(path).replace(/^fixer-verified-rewrite\/?/, "");
}

function decodeTextFile(content: string | Uint8Array): string {
  return typeof content === "string" ? content : textDecoder.decode(content);
}

function routePathForHtml(path: string): string {
  const normalized = normalizeAssetPath(path).replace(/\.html$/i, "");
  if (normalized === "index") return "/";
  if (normalized.endsWith("/index")) return `/${normalized.slice(0, -"/index".length)}`;
  return `/${normalized}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
