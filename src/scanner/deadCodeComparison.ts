import type { ProofLevel } from "../core/proof";
import { proof } from "../core/proof";
import type { ProjectRoot, ProjectRootsMap, ReachabilityDomain, RootCandidate, Runtime } from "../core/roots";
import type { ZipTextFile } from "./browserZip";
import {
  buildDeadCodeCandidate,
  buildDeadCodeReferenceGraph,
  walkDeadCodeReachability,
} from "./projectMaps";
import { countLines, isScriptPath, normalizeAssetPath } from "./scannerUtils";
import type {
  DeadCodeComparisonItem,
  DeadCodeComparisonMap,
  DeadCodeComparisonStatus,
  DeadCodeMap,
  ReachabilityStatus,
} from "./types";
import type { ZipFileInput } from "./zipWriter";

const domains: ReachabilityDomain[] = ["production", "build", "tooling", "test", "migration"];

export function buildDeadCodeComparisonMap(
  files: ZipTextFile[],
  legacy: DeadCodeMap,
  projectRootsMap: ProjectRootsMap,
  rootsMapHash: string,
): DeadCodeComparisonMap {
  const graph = buildDeadCodeReferenceGraph(files);
  const executableRoots = projectRootsMap.roots.filter(isExecutionRoot).filter((root) => graph.allPaths.has(normalizeAssetPath(root.path)));
  const reachability = reachabilityByRoot(executableRoots, graph.graph);
  const repositoryReachable = unionSets([...reachability.byDomain.values()]);
  const textPaths = [...graph.allPaths].sort();
  const legacyDead = new Map(legacy.unreachableFiles.map((candidate) => [candidate.path, candidate]));
  const legacyReachable = new Set(legacy.reachableFiles);
  const preservedByPath = new Map(projectRootsMap.preservedArtifacts.map((artifact) => [artifact.path, artifact]));
  const candidateClosures = projectRootsMap.candidates.map((candidate) => candidateClosure(candidate, graph.graph));
  const items = [
    ...textPaths.map((path) =>
      comparisonItem(path, graph.byPath.get(path)?.text ?? "", legacyDead, legacyReachable, preservedByPath, candidateClosures, reachability, repositoryReachable),
    ),
    ...projectRootsMap.preservedArtifacts
      .filter((artifact) => !graph.allPaths.has(artifact.path))
      .map((artifact) =>
        comparisonItem(artifact.path, "", legacyDead, legacyReachable, preservedByPath, candidateClosures, reachability, repositoryReachable),
      ),
  ].sort((a, b) => a.path.localeCompare(b.path));

  const deltas = {
    rescuedByRoots: items.filter((item) => item.comparison === "rescued-by-root"),
    protectedArtifacts: items.filter((item) => item.comparison === "protected-artifact"),
    blockedByCandidates: items.filter((item) => item.comparison === "blocked-by-candidate"),
    rootAwareOnly: items.filter((item) => item.comparison === "root-aware-only"),
    unchangedDead: items.filter((item) => item.comparison === "unchanged-dead"),
    unchangedReachable: items.filter((item) => item.comparison === "unchanged-reachable"),
    unknown: items.filter((item) => item.comparison === "unknown"),
  };

  return {
    schemaVersion: "dead-code-comparison.v1",
    rootsMapHash,
    legacy: {
      source: "html-entrypoints-only",
      deadCodeMapHash: stableHash(legacy),
      summary: {
        markedDead: legacy.unreachableFiles.length,
        reachable: legacy.reachableFiles.length,
        unknown: items.filter((item) => item.legacy.status === "unknown").length,
      },
    },
    rootAware: {
      source: "project-roots-map",
      domainsAnalyzed: domains,
      rootIdsAnalyzed: executableRoots.map((root) => root.id).sort(),
      candidatePolicy: "block-certainty",
      summary: {
        productionReachable: reachability.byDomain.get("production")?.size ?? 0,
        repositoryReachable: repositoryReachable.size,
        unreachableAllDomains: items.filter((item) => item.rootAware.status === "unreachable").length,
        blockedByCandidates: deltas.blockedByCandidates.length,
        protectedArtifacts: deltas.protectedArtifacts.length,
        unknown: deltas.unknown.length,
      },
    },
    deltas,
    diagnostics: [
      ...ignoredTypeScriptRootDiagnostics(projectRootsMap.roots),
      ...projectRootsMap.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        message: diagnostic.message,
        path: diagnostic.path,
      })),
    ],
  };
}

export function buildDeadCodeComparisonExportFile(map: DeadCodeComparisonMap): ZipFileInput {
  return {
    path: "project-ir/dead-code-comparison.json",
    content: `${JSON.stringify(map, null, 2)}\n`,
  };
}

function comparisonItem(
  path: string,
  text: string,
  legacyDead: Map<string, ReturnType<typeof buildDeadCodeCandidate>>,
  legacyReachable: Set<string>,
  preservedByPath: Map<string, ProjectRootsMap["preservedArtifacts"][number]>,
  candidateClosures: CandidateClosure[],
  reachability: RootReachability,
  repositoryReachable: Set<string>,
): DeadCodeComparisonItem {
  const preservedArtifact = preservedByPath.get(path);
  const reachedFrom = reachability.byPath.get(path) ?? [];
  const candidateBlockers = candidateClosures.filter((candidate) => candidate.blocks(path)).map(({ candidate, impact }) => ({
    candidateId: candidate.id,
    reason: candidate.reason,
    impact,
  }));
  const status = rootAwareStatus(path, preservedArtifact?.id, repositoryReachable, candidateBlockers.length);
  const legacyCandidate = legacyDead.get(path);
  const legacyStatus = legacyCandidate ? "dead" : legacyReachable.has(path) ? "reachable" : "unknown";
  const comparison = comparisonKind(legacyStatus, status);

  return {
    path,
    lines: text ? countLines(text) : legacyCandidate?.lines ?? 0,
    legacy: {
      status: legacyStatus,
      reason: legacyCandidate?.reason ?? (legacyStatus === "reachable" ? "Reached from legacy HTML entrypoints." : "No legacy classification."),
    },
    rootAware: {
      status,
      production: domainStatus(path, reachability.byDomain.get("production"), candidateBlockers.length),
      build: domainStatus(path, reachability.byDomain.get("build"), candidateBlockers.length),
      tooling: domainStatus(path, reachability.byDomain.get("tooling"), candidateBlockers.length),
      test: domainStatus(path, reachability.byDomain.get("test"), candidateBlockers.length),
      migration: domainStatus(path, reachability.byDomain.get("migration"), candidateBlockers.length),
      reachedFrom,
      candidateBlockers,
      preservedArtifactId: preservedArtifact?.id,
    },
    comparison,
    proof: comparisonProof(path, status, reachedFrom, candidateBlockers.length, preservedArtifact?.id),
  };
}

interface RootReachability {
  byDomain: Map<ReachabilityDomain, Set<string>>;
  byPath: Map<string, Array<{ rootId: string; domain: ReachabilityDomain; runtime: Runtime }>>;
}

function reachabilityByRoot(roots: ProjectRoot[], graph: Map<string, Set<string>>): RootReachability {
  const byDomain = new Map(domains.map((domain) => [domain, new Set<string>()]));
  const byPath = new Map<string, Array<{ rootId: string; domain: ReachabilityDomain; runtime: Runtime }>>();

  for (const root of roots) {
    const reached = walkDeadCodeReachability([normalizeAssetPath(root.path)], graph);
    for (const path of reached) {
      byDomain.get(root.domain)?.add(path);
      const rootsForPath = byPath.get(path) ?? [];
      rootsForPath.push({ rootId: root.id, domain: root.domain, runtime: root.runtime });
      byPath.set(path, rootsForPath);
    }
  }

  return { byDomain, byPath };
}

interface CandidateClosure {
  candidate: RootCandidate;
  impact: "path-scoped" | "global";
  blocks: (path: string) => boolean;
}

function candidateClosure(candidate: RootCandidate, graph: Map<string, Set<string>>): CandidateClosure {
  const path = candidate.path ? normalizeAssetPath(candidate.path) : null;
  const impact = path && isExecutablePath(path) && graph.has(path) ? "path-scoped" : "global";
  const reachable = impact === "path-scoped" && path ? walkDeadCodeReachability([path], graph) : null;
  return {
    candidate,
    impact,
    blocks: (targetPath) => (reachable ? reachable.has(targetPath) : true),
  };
}

function isExecutionRoot(root: ProjectRoot): boolean {
  return root.kind !== "typescript-project";
}

function isExecutablePath(path: string): boolean {
  return path.endsWith(".html") || isScriptPath(path);
}

function rootAwareStatus(
  path: string,
  preservedArtifactId: string | undefined,
  repositoryReachable: Set<string>,
  candidateBlockers: number,
): DeadCodeComparisonStatus {
  if (preservedArtifactId) return "preserved-artifact";
  if (repositoryReachable.has(path)) return "reachable";
  if (candidateBlockers) return "blocked-by-candidate";
  return "unreachable";
}

function domainStatus(path: string, reachable: Set<string> | undefined, candidateBlockers: number): ReachabilityStatus {
  if (reachable?.has(path)) return "reachable";
  if (candidateBlockers) return "unknown";
  return "unreachable";
}

function comparisonKind(legacyStatus: "reachable" | "dead" | "unknown", rootAwareStatus: DeadCodeComparisonStatus): DeadCodeComparisonItem["comparison"] {
  if (rootAwareStatus === "preserved-artifact") return "protected-artifact";
  if (rootAwareStatus === "blocked-by-candidate") return "blocked-by-candidate";
  if (legacyStatus === "dead" && rootAwareStatus === "reachable") return "rescued-by-root";
  if (legacyStatus === "dead" && rootAwareStatus === "unreachable") return "unchanged-dead";
  if (legacyStatus === "reachable" && rootAwareStatus === "reachable") return "unchanged-reachable";
  if (rootAwareStatus === "unreachable") return "root-aware-only";
  return "unknown";
}

function comparisonProof(
  path: string,
  status: DeadCodeComparisonStatus,
  reachedFrom: Array<{ rootId: string; domain: ReachabilityDomain; runtime: Runtime }>,
  candidateBlockers: number,
  preservedArtifactId?: string,
) {
  const basis = reachedFrom.length
    ? reachedFrom.map((root) => ({ source: "project-roots-map", detail: `Reached from ${root.rootId}.`, path }))
    : [{ source: "dead-code-comparison", detail: `${status}.`, path, value: preservedArtifactId }];
  const level: ProofLevel = status === "blocked-by-candidate" || candidateBlockers ? "unresolved" : status === "reachable" ? "supported" : "heuristic";
  return proof(level, basis, ["Deletion remains disabled. This comparison is read-only."]);
}

function ignoredTypeScriptRootDiagnostics(roots: ProjectRoot[]) {
  return roots
    .filter((root) => root.kind === "typescript-project")
    .map((root) => ({
      severity: "info" as const,
      message: "TypeScript project root marks build scope only and does not seed execution reachability.",
      path: root.path,
    }));
}

function unionSets(sets: Set<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]));
}

function stableHash(value: unknown): string {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
