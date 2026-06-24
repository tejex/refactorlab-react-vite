import { normalizeProjectPath, normalizeProjectPaths, type ProjectSourceFile } from "./entity";
import type {
  DetectorResult,
  ProjectRoot,
  ProjectRootDetector,
  ProjectRootsMap,
  ProjectRootsStats,
  ReachabilityDomain,
  RootCandidate,
  RootDiscoveryDiagnostic,
  PreservedArtifact,
} from "./roots";
import { cloudflareWorkersDetector } from "./projectDetectors/cloudflareWorkers";
import { htmlRoutesDetector } from "./projectDetectors/htmlRoutes";
import { migrationsDetector } from "./projectDetectors/migrations";
import { packageCommandsDetector } from "./projectDetectors/packageCommands";
import { publicResourcesDetector } from "./projectDetectors/publicResources";
import { supabaseFunctionsDetector } from "./projectDetectors/supabaseFunctions";
import { testsDetector } from "./projectDetectors/tests";
import { typescriptProjectsDetector } from "./projectDetectors/typescriptProjects";

export interface BuildProjectRootsInput {
  files: ProjectSourceFile[];
  allPaths: string[];
  projectRoot?: string;
  detectors?: ProjectRootDetector[];
}

export const defaultProjectRootDetectors: ProjectRootDetector[] = [
  htmlRoutesDetector,
  cloudflareWorkersDetector,
  supabaseFunctionsDetector,
  packageCommandsDetector,
  typescriptProjectsDetector,
  testsDetector,
  migrationsDetector,
  publicResourcesDetector,
];

export function buildProjectRoots(input: BuildProjectRootsInput): ProjectRootsMap {
  const projectRoot = normalizeProjectPath(input.projectRoot ?? "");
  const files = input.files
    .map((file) => ({ ...file, path: normalizeInputPath(file.path, projectRoot) }))
    .filter((file) => file.path)
    .sort((a, b) => a.path.localeCompare(b.path));
  const allPaths = normalizeProjectPaths(input.allPaths.map((path) => normalizeInputPath(path, projectRoot)));
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const allPathSet = new Set(allPaths);
  const results: DetectorResult[] = [];

  for (const detector of input.detectors ?? defaultProjectRootDetectors) {
    try {
      results.push(detector.detect({ files, allPaths, fileByPath, allPathSet }));
    } catch (error) {
      results.push({
        roots: [],
        candidates: [],
        preservedArtifacts: [],
        diagnostics: [
          {
            detector: detector.id,
            severity: "warning",
            message: error instanceof Error ? error.message : "Detector failed.",
          },
        ],
      });
    }
  }

  const roots = uniqueById(results.flatMap((result) => result.roots)).sort(compareById);
  const candidates = uniqueById(results.flatMap((result) => result.candidates)).sort(compareById);
  const preservedArtifacts = uniqueById(results.flatMap((result) => result.preservedArtifacts)).sort(compareById);
  const diagnostics = results.flatMap((result) => result.diagnostics).sort(compareDiagnostics);

  return {
    schemaVersion: "project-roots.v1",
    roots,
    candidates,
    preservedArtifacts,
    diagnostics,
    stats: statsFor(roots, candidates, preservedArtifacts, diagnostics),
  };
}

function normalizeInputPath(path: string, projectRoot: string): string {
  const normalized = normalizeProjectPath(path);
  if (!projectRoot) return normalized;
  if (normalized === projectRoot) return "";
  return normalized.startsWith(`${projectRoot}/`) ? normalized.slice(projectRoot.length + 1) : normalized;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function compareDiagnostics(a: RootDiscoveryDiagnostic, b: RootDiscoveryDiagnostic): number {
  return a.detector.localeCompare(b.detector) || (a.path ?? "").localeCompare(b.path ?? "") || a.message.localeCompare(b.message);
}

function statsFor(
  roots: ProjectRoot[],
  candidates: RootCandidate[],
  preservedArtifacts: PreservedArtifact[],
  diagnostics: RootDiscoveryDiagnostic[],
): ProjectRootsStats {
  const byDomain: Record<ReachabilityDomain, number> = {
    production: 0,
    build: 0,
    tooling: 0,
    test: 0,
    migration: 0,
  };

  for (const root of roots) byDomain[root.domain] += 1;

  return {
    roots: roots.length,
    candidates: candidates.length,
    preservedArtifacts: preservedArtifacts.length,
    diagnostics: diagnostics.length,
    byDomain,
  };
}
