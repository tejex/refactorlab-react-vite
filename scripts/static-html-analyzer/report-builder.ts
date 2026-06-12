import type {
  ClusterSummary,
  DuplicateName,
  DuplicateSelector,
  FileAnalysis,
  ProjectSummary,
  Recommendation,
  StaticHtmlReport,
} from "./types.ts";

export function buildReport(targetRoot: string, analyses: FileAnalysis[]): StaticHtmlReport {
  const duplicateSelectors = findDuplicateSelectors(analyses);
  const duplicateNames = findDuplicateNames(analyses);
  const clusters = buildClusters(analyses);

  return {
    targetRoot,
    generatedAt: new Date().toISOString(),
    summary: summarize(analyses),
    topFiles: analyses.slice(0, 15),
    clusters,
    duplicateSelectors,
    duplicateNames,
    recommendations: buildRecommendations(analyses, clusters, duplicateSelectors, duplicateNames),
  };
}

function summarize(items: FileAnalysis[]): ProjectSummary {
  const byExtension: ProjectSummary["byExtension"] = {};

  for (const item of items) {
    const bucket = (byExtension[item.extension] ??= { files: 0, lines: 0, riskScore: 0 });
    bucket.files += 1;
    bucket.lines += item.lines;
    bucket.riskScore += item.riskScore;
  }

  return {
    files: items.length,
    lines: sumBy(items, "lines"),
    byExtension,
    highestRiskFile: items[0]?.path ?? null,
  };
}

function buildClusters(items: FileAnalysis[]): ClusterSummary[] {
  const groups: Array<[string, RegExp]> = [
    ["studio", /(^|\/)studio\//],
    ["api-dashboard", /(^|\/)api\//],
    ["blog-content", /(^|\/)(blog|posts)\//],
    ["chat", /(^|\/)chat\//],
    ["worker-api", /(^|\/)workers\//],
    ["site-shell", /(^|\/)(index|pricing|theme|site-banner|grid-bg)/],
  ];

  return groups
    .map(([name, pattern]) => summarizeCluster(name, items.filter((item) => pattern.test(item.path))))
    .filter((cluster) => cluster.files > 0)
    .sort((a, b) => b.riskScore - a.riskScore);
}

function summarizeCluster(name: string, files: FileAnalysis[]): ClusterSummary {
  return {
    name,
    files: files.length,
    lines: sumBy(files, "lines"),
    riskScore: sumBy(files, "riskScore"),
    topFiles: [...files]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5)
      .map((item) => item.path),
  };
}

function buildRecommendations(
  items: FileAnalysis[],
  clusters: ClusterSummary[],
  duplicateSelectors: DuplicateSelector[],
  duplicateNames: DuplicateName[],
): Recommendation[] {
  const highRisk = items.slice(0, 5);
  const recommendations: Recommendation[] = [
    {
      title: "Start with the largest isolated surface",
      body: `${clusters[0]?.name ?? "the top cluster"} has the highest combined risk. Analyze its top files before touching shared site-wide code.`,
    },
    {
      title: "Extract pure helpers before DOM behavior",
      body: "Files with high line count but fewer DOM side effects are safer first extractions than event-heavy pages.",
    },
    {
      title: "Create shared shell inventory",
      body: `${duplicateSelectors.length} selectors repeat across files. Repeated nav, pricing, card, and theme selectors are likely shared-shell candidates.`,
    },
    {
      title: "Defer worker/API splits until call graph pass",
      body: "Worker code has backend platform side effects. V1 should report boundaries first, then add call-graph detail before extraction.",
    },
  ];

  if (duplicateNames.length > 0) {
    recommendations.push({
      title: "Review repeated symbol names",
      body: `${duplicateNames.length} function or variable names appear in more than one file. Some may be duplicated utilities.`,
    });
  }

  recommendations.push({
    title: "First files to inspect",
    body: highRisk.map((file) => file.path).join(", "),
  });

  return recommendations;
}

function findDuplicateSelectors(items: FileAnalysis[]): DuplicateSelector[] {
  const seen = collectOccurrences(items, (item) => item.selectors);
  return [...seen.entries()]
    .filter(([, fileSet]) => fileSet.size >= 3)
    .map(([selector, fileSet]) => ({ selector, files: [...fileSet].slice(0, 12), count: fileSet.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

function findDuplicateNames(items: FileAnalysis[]): DuplicateName[] {
  const seen = collectOccurrences(items, (item) => item.symbols.filter((symbol) => symbol.length >= 3));
  return [...seen.entries()]
    .filter(([, fileSet]) => fileSet.size >= 2)
    .map(([symbol, fileSet]) => ({ symbol, files: [...fileSet], count: fileSet.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

function collectOccurrences(items: FileAnalysis[], getValues: (item: FileAnalysis) => string[]): Map<string, Set<string>> {
  const seen = new Map<string, Set<string>>();

  for (const item of items) {
    for (const value of getValues(item)) {
      if (!value || value.length < 2) continue;
      if (!seen.has(value)) seen.set(value, new Set());
      seen.get(value)?.add(item.path);
    }
  }

  return seen;
}

function sumBy(items: FileAnalysis[], key: "lines" | "riskScore"): number {
  return items.reduce((sum, item) => sum + item[key], 0);
}
