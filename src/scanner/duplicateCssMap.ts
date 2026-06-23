import type { ZipTextFile } from "./browserZip";
import type { DuplicateCssMap } from "./types";
import { extractCssSelectors } from "./analysisSummary";
import { normalizeAssetPath } from "./scannerUtils";

export function buildDuplicateCssMap(files: ZipTextFile[]): DuplicateCssMap {
  const selectorSources = new Map<string, Set<string>>();

  for (const file of files) {
    const path = normalizeAssetPath(file.path);
    const styleBlocks = path.endsWith(".css") ? [file.text] : extractInlineStyleTexts(file.text);

    for (const blockText of styleBlocks) {
      for (const selector of extractCssSelectors(blockText).map(normalizeCssSelector).filter(Boolean)) {
        const sources = selectorSources.get(selector) ?? new Set<string>();
        sources.add(path);
        selectorSources.set(selector, sources);
      }
    }
  }

  const repeatedSelectors = [...selectorSources.entries()]
    .map(([selector, sources]) => ({
      selector,
      count: sources.size,
      sources: [...sources].sort(),
    }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count || a.selector.localeCompare(b.selector))
    .slice(0, 20);

  return { repeatedSelectors };
}

function extractInlineStyleTexts(text: string): string[] {
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
}

function normalizeCssSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}
