import type { ZipTextFile } from "./browserZip";
import type { InlineAssetPlan, ReactConversionMap } from "./types";
import { findExternalAssetOrder } from "./extractionPlan";
import { normalizeAssetPath } from "./scannerUtils";

export function buildReactRoutes(htmlFiles: ZipTextFile[], inlineAssetPlan: InlineAssetPlan): ReactConversionMap["routes"] {
  const inlineBlockCounts = new Map<string, number>();
  for (const block of inlineAssetPlan.blocks) {
    inlineBlockCounts.set(block.file, (inlineBlockCounts.get(block.file) ?? 0) + 1);
  }

  return htmlFiles
    .map((file) => {
      const assetOrder = findExternalAssetOrder(file);
      return {
        sourceFile: normalizeAssetPath(file.path),
        routePath: reactRouteFromHtmlPath(file.path),
        componentName: reactPageComponentName(file.path),
        title: htmlTitle(file.text),
        stylesheets: assetOrder.stylesheets.length,
        scripts: assetOrder.scripts.length,
        inlineBlocks: inlineBlockCounts.get(file.path) ?? 0,
      };
    })
    .sort((a, b) => a.routePath.localeCompare(b.routePath) || a.sourceFile.localeCompare(b.sourceFile));
}

function reactRouteFromHtmlPath(path: string): string {
  const normalized = normalizeAssetPath(path).replace(/\.html$/i, "");
  const parts = normalized.split("/").filter(Boolean);
  const routeParts = parts.at(-1)?.toLowerCase() === "index" ? parts.slice(0, -1) : parts;
  return routeParts.length ? `/${routeParts.join("/")}` : "/";
}

function reactPageComponentName(path: string): string {
  const routeParts = reactRouteFromHtmlPath(path).split("/").filter(Boolean);
  if (!routeParts.length) return "HomePage";
  return `${toPascalCase(routeParts.join(" "))}Page`;
}

function htmlTitle(text: string): string {
  const title = new DOMParser().parseFromString(text, "text/html").querySelector("title")?.textContent?.trim();
  return title || "Untitled page";
}

export function toPascalCase(value: string): string {
  const words = value.match(/[a-z0-9]+/gi) ?? [];
  const name = words.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join("");
  return name || "Component";
}
