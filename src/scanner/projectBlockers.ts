import type { MissingReference, ProjectReport } from "./types";

export type ProjectBlocker = MissingReference | { sourceFile: string; importPath: string; kind: "import" };

export interface ProjectBlockerGroup {
  id: string;
  kind: ProjectBlocker["kind"];
  target: string;
  sourceFiles: string[];
  count: number;
  summary: string;
}

export function collectProjectBlockers(report: ProjectReport): ProjectBlocker[] {
  const missingReferences = report.integrityMap?.missingReferences ?? [];
  const unresolvedImports = report.jsTsModuleMap?.unresolvedImports.map((item) => ({ ...item, kind: "import" as const })) ?? [];
  const seen = new Set<string>();

  return [...missingReferences, ...unresolvedImports].filter((blocker) => {
    const key = "missingPath" in blocker ? `${blocker.sourceFile}:${blocker.missingPath}:${blocker.kind}` : `${blocker.sourceFile}:${blocker.importPath}:import`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupProjectBlockers(blockers: ProjectBlocker[]): ProjectBlockerGroup[] {
  const byTarget = new Map<string, ProjectBlockerGroup>();

  for (const blocker of blockers) {
    const target = blockerTarget(blocker);
    const key = `${blocker.kind}:${target}`;
    const group = byTarget.get(key) ?? {
      id: stableId(key),
      kind: blocker.kind,
      target,
      sourceFiles: [],
      count: 0,
      summary: "",
    };

    group.sourceFiles.push(blocker.sourceFile);
    group.count += 1;
    byTarget.set(key, group);
  }

  return [...byTarget.values()]
    .map((group) => ({
      ...group,
      sourceFiles: [...new Set(group.sourceFiles)].sort(),
      summary: formatProjectBlockerGroup(group),
    }))
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target));
}

export function groupedProjectBlockersForReport(report: ProjectReport): ProjectBlockerGroup[] {
  return groupProjectBlockers(collectProjectBlockers(report));
}

export function formatProjectBlocker(blocker: ProjectBlocker): string {
  if ("missingPath" in blocker) return `${blocker.kind} ${blocker.missingPath} referenced by ${blocker.sourceFile}`;
  return `import ${blocker.importPath} referenced by ${blocker.sourceFile}`;
}

export function formatProjectBlockerGroup(group: Pick<ProjectBlockerGroup, "kind" | "target" | "count">): string {
  return `${group.kind} ${group.target} referenced by ${group.count.toLocaleString()} file(s)`;
}

function blockerTarget(blocker: ProjectBlocker): string {
  return "missingPath" in blocker ? blocker.missingPath : blocker.importPath;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
