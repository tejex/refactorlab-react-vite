import type { Proof } from "../core/proof";
import type { ReachabilityDomain, Runtime } from "../core/roots";

export type DeadCodeConfidence = "High" | "Review";

export interface DeadCodeCandidate {
  path: string;
  kind: "style" | "script" | "page" | "source";
  confidence: DeadCodeConfidence;
  reason: string;
  lines: number;
}

export interface DeadCodeMap {
  entrypoints: string[];
  reachableFiles: string[];
  unreachableFiles: DeadCodeCandidate[];
}

export type ReachabilityStatus = "reachable" | "unreachable" | "unknown";

export type DeadCodeComparisonStatus =
  | "reachable"
  | "unreachable"
  | "blocked-by-candidate"
  | "preserved-artifact"
  | "unknown";

export type DeadCodeComparisonKind =
  | "rescued-by-root"
  | "protected-artifact"
  | "blocked-by-candidate"
  | "root-aware-only"
  | "unchanged-dead"
  | "unchanged-reachable"
  | "unknown";

export interface DeadCodeComparisonItem {
  path: string;
  lines: number;
  legacy: {
    status: "reachable" | "dead" | "unknown";
    reason: string;
  };
  rootAware: {
    status: DeadCodeComparisonStatus;
    production: ReachabilityStatus;
    build: ReachabilityStatus;
    tooling: ReachabilityStatus;
    test: ReachabilityStatus;
    migration: ReachabilityStatus;
    reachedFrom: Array<{
      rootId: string;
      domain: ReachabilityDomain;
      runtime: Runtime;
    }>;
    candidateBlockers: Array<{
      candidateId: string;
      reason: string;
      impact: "path-scoped" | "global";
    }>;
    preservedArtifactId?: string;
  };
  comparison: DeadCodeComparisonKind;
  proof: Proof;
}

export interface DeadCodeComparisonMap {
  schemaVersion: "dead-code-comparison.v1";
  rootsMapHash: string;
  legacy: {
    source: "html-entrypoints-only";
    deadCodeMapHash?: string;
    summary: {
      markedDead: number;
      reachable: number;
      unknown: number;
    };
  };
  rootAware: {
    source: "project-roots-map";
    domainsAnalyzed: ReachabilityDomain[];
    rootIdsAnalyzed: string[];
    candidatePolicy: "block-certainty";
    summary: {
      productionReachable: number;
      repositoryReachable: number;
      unreachableAllDomains: number;
      blockedByCandidates: number;
      protectedArtifacts: number;
      unknown: number;
    };
  };
  deltas: {
    rescuedByRoots: DeadCodeComparisonItem[];
    protectedArtifacts: DeadCodeComparisonItem[];
    blockedByCandidates: DeadCodeComparisonItem[];
    rootAwareOnly: DeadCodeComparisonItem[];
    unchangedDead: DeadCodeComparisonItem[];
    unchangedReachable: DeadCodeComparisonItem[];
    unknown: DeadCodeComparisonItem[];
  };
  diagnostics: Array<{
    severity: "info" | "warning";
    message: string;
    path?: string;
  }>;
}
