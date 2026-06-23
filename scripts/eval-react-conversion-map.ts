import type { ZipTextFile } from "../src/scanner/browserZip";
import { dirname, joinProjectPath, normalizeAssetPath } from "../src/scanner/scannerUtils";
import type { ProjectReport } from "../src/scanner/types";

export function buildEvalReactConversionMap(
  fixtureName: string,
  textFiles: ZipTextFile[],
  inlineBlocks: number,
  blockers: NonNullable<ProjectReport["integrityMap"]>["missingReferences"],
): NonNullable<ProjectReport["reactConversionMap"]> {
  const htmlFiles = textFiles.filter((file) => file.path.endsWith(".html"));
  const routes = htmlFiles.map((file) => ({
    sourceFile: file.path,
    routePath: routePathForHtml(file.path),
    componentName: componentNameForHtml(file.path),
    title: fixtureName,
    stylesheets: 0,
    scripts: 0,
    inlineBlocks,
  }));
  const routePackets = routes.map((route) => ({
    slug: route.componentName.replace(/Page$/, "").toLowerCase(),
    routePath: route.routePath,
    sourceFile: route.sourceFile,
    pageComponentName: route.componentName,
    title: route.title,
    componentOwners: [],
    behaviorBindings: [],
    cssSelectors: [],
    assets: extractAssetReferences(textFiles.find((file) => file.path === route.sourceFile)?.text ?? "", route.sourceFile),
    blockers,
    suggestedOrder: ["Create the route shell from the source HTML.", "Apply verified extraction files before framework conversion."],
  }));

  return {
    routes,
    routePackets,
    aiHandoff: {
      status: "Ready",
      confidence: "High",
      summary: `${fixtureName} eval handoff`,
      primaryRoute: routePackets[0]
        ? {
            routePath: routePackets[0].routePath,
            sourceFile: routePackets[0].sourceFile,
            packetSlug: routePackets[0].slug,
            componentOwners: 0,
            behaviorBindings: 0,
            blockers: blockers.length,
          }
        : null,
      steps: [
        {
          title: "Start with route packet",
          detail: "Use parser route facts before raw source scanning.",
          facts: [`routes=${routes.length}`, `blockers=${blockers.length}`],
        },
      ],
      promptFacts: [`source=${fixtureName}`, `routePackets=${routePackets.length}`],
    },
    componentCandidates: [],
    componentOwnership: [],
    behaviorFiles: [],
    behaviorBindings: [],
    blockers,
  };
}

function routePathForHtml(filePath: string): string {
  const normalized = filePath.replace(/\.html$/i, "");
  if (normalized === "index") return "/";
  if (normalized.endsWith("/index")) return `/${normalized.slice(0, -"/index".length)}`;
  return `/${normalized}`;
}

function componentNameForHtml(filePath: string): string {
  const normalized = filePath.replace(/\.html$/i, "");
  const baseName = normalized.endsWith("/index") ? normalized.split("/").at(-2) ?? "index" : normalized.split("/").at(-1) ?? "page";
  const name = baseName
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return `${name || "Route"}Page`;
}

function extractAssetReferences(text: string, sourceFile: string): string[] {
  const references = [
    ...attributeValues(text, "src"),
    ...attributeValues(text, "href"),
    ...attributeValues(text, "data-src"),
    ...srcsetValues(text),
  ];

  return [...new Set(references.map((reference) => resolveAssetReference(reference, sourceFile)).filter((path): path is string => Boolean(path)))].sort();
}

function attributeValues(text: string, attribute: string): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "gi");
  for (const match of text.matchAll(pattern)) values.push(match[1] ?? "");
  return values;
}

function srcsetValues(text: string): string[] {
  return attributeValues(text, "srcset").flatMap((srcset) => srcset.split(",").map((item) => item.trim().split(/\s+/)[0] ?? ""));
}

function resolveAssetReference(reference: string, sourceFile: string): string | null {
  if (!reference || reference.startsWith("#") || /^(https?:)?\/\//i.test(reference) || /^(data|mailto|tel|javascript|blob):/i.test(reference)) {
    return null;
  }

  const cleanReference = normalizeAssetPath(reference.split(/[?#]/)[0] ?? "");
  if (!cleanReference || !isStaticAsset(cleanReference)) return null;
  return reference.startsWith("/") ? cleanReference : joinProjectPath(dirname(sourceFile), cleanReference);
}

function isStaticAsset(path: string): boolean {
  return /\.(avif|gif|ico|jpe?g|png|svg|webp|m4v|mov|mp4|ogv|webm|aac|flac|m4a|mp3|oga|ogg|wav|eot|otf|ttf|woff2?|pdf|csv|json|xml)$/i.test(path);
}
