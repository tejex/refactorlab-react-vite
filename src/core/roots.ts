import type { ProjectSourceFile } from "./entity";
import type { Proof } from "./proof";

export type ReachabilityDomain = "production" | "build" | "tooling" | "test" | "migration";

export type Runtime = "browser" | "node" | "deno" | "cloudflare-worker" | "shell" | "database" | "unknown";

export type ProjectRootKind =
  | "html-route"
  | "cloudflare-worker"
  | "supabase-function"
  | "package-command"
  | "typescript-project"
  | "test-file";

export interface ProjectRoot {
  id: string;
  kind: ProjectRootKind;
  label: string;
  path: string;
  domain: ReachabilityDomain;
  runtime: Runtime;
  proof: Proof;
}

export interface RootCandidate {
  id: string;
  kind: ProjectRootKind;
  label: string;
  path: string | null;
  domain: ReachabilityDomain;
  runtime: Runtime;
  reason: string;
  proof: Proof;
}

export type PreservedArtifactKind = "public-resource" | "migration" | "generated-output" | "external-resource";

export interface PreservedArtifact {
  id: string;
  kind: PreservedArtifactKind;
  label: string;
  path: string;
  externallyAddressable: boolean;
  reason: string;
  proof: Proof;
}

export interface RootDiscoveryDiagnostic {
  detector: string;
  severity: "info" | "warning";
  message: string;
  path?: string;
}

export interface ProjectRootsStats {
  roots: number;
  candidates: number;
  preservedArtifacts: number;
  diagnostics: number;
  byDomain: Record<ReachabilityDomain, number>;
}

export interface ProjectRootsMap {
  schemaVersion: "project-roots.v1";
  roots: ProjectRoot[];
  candidates: RootCandidate[];
  preservedArtifacts: PreservedArtifact[];
  diagnostics: RootDiscoveryDiagnostic[];
  stats: ProjectRootsStats;
}

export interface ProjectRootDetectorInput {
  files: ProjectSourceFile[];
  allPaths: string[];
  fileByPath: Map<string, ProjectSourceFile>;
  allPathSet: Set<string>;
}

export interface DetectorResult {
  roots: ProjectRoot[];
  candidates: RootCandidate[];
  preservedArtifacts: PreservedArtifact[];
  diagnostics: RootDiscoveryDiagnostic[];
}

export interface ProjectRootDetector {
  id: string;
  detect(input: ProjectRootDetectorInput): DetectorResult;
}

export function emptyDetectorResult(): DetectorResult {
  return {
    roots: [],
    candidates: [],
    preservedArtifacts: [],
    diagnostics: [],
  };
}

