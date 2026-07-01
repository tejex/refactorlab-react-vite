import type { ProofLevel } from "../core/proof";
import type { ProjectRootsMap, ReachabilityDomain, Runtime } from "../core/roots";
import { downloadZip, type ZipFileInput } from "./zipWriter";

const textEncoder = new TextEncoder();

export interface ProjectRootsProofSummary {
  schemaVersion: "project-roots-proof-summary.v1";
  rootsMapHash: string;
  sourceSchemaVersion: ProjectRootsMap["schemaVersion"];
  totals: {
    roots: number;
    candidates: number;
    preservedArtifacts: number;
    diagnostics: number;
  };
  rootsByDomain: Record<ReachabilityDomain, number>;
  rootsByRuntime: Partial<Record<Runtime, number>>;
  proofLevels: Record<ProofLevel, number>;
  diagnostics: ProjectRootsMap["diagnostics"];
}

export function canonicalizeProjectRootsMap(map: ProjectRootsMap): string {
  return `${JSON.stringify(normalizedProjectRootsMap(map), null, 2)}\n`;
}

export async function hashProjectRootsMap(map: ProjectRootsMap): Promise<string> {
  return sha256Hex(canonicalizeProjectRootsMap(map));
}

export function buildProjectRootsExportFiles(map: ProjectRootsMap, rootsMapHash: string, extraFiles: ZipFileInput[] = []): ZipFileInput[] {
  return [
    {
      path: "project-ir/roots.json",
      content: `${JSON.stringify({ rootsMapHash, projectRootsMap: normalizedProjectRootsMap(map) }, null, 2)}\n`,
    },
    {
      path: "project-ir/proof-summary.json",
      content: `${JSON.stringify(buildProjectRootsProofSummary(map, rootsMapHash), null, 2)}\n`,
    },
    ...extraFiles,
  ];
}

export function downloadProjectRootsIr(map: ProjectRootsMap, rootsMapHash: string, extraFiles: ZipFileInput[] = []) {
  downloadZip(buildProjectRootsExportFiles(map, rootsMapHash, extraFiles), "fixer-project-ir.zip");
}

export function buildProjectRootsProofSummary(map: ProjectRootsMap, rootsMapHash: string): ProjectRootsProofSummary {
  return {
    schemaVersion: "project-roots-proof-summary.v1",
    rootsMapHash,
    sourceSchemaVersion: map.schemaVersion,
    totals: {
      roots: map.roots.length,
      candidates: map.candidates.length,
      preservedArtifacts: map.preservedArtifacts.length,
      diagnostics: map.diagnostics.length,
    },
    rootsByDomain: map.stats.byDomain,
    rootsByRuntime: countBy(map.roots, (root) => root.runtime),
    proofLevels: countProofLevels(map),
    diagnostics: map.diagnostics,
  };
}

function normalizedProjectRootsMap(map: ProjectRootsMap): ProjectRootsMap {
  return {
    schemaVersion: map.schemaVersion,
    roots: [...map.roots].sort(compareById),
    candidates: [...map.candidates].sort(compareById),
    preservedArtifacts: [...map.preservedArtifacts].sort(compareById),
    diagnostics: [...map.diagnostics].sort(compareDiagnostics),
    stats: {
      roots: map.stats.roots,
      candidates: map.stats.candidates,
      preservedArtifacts: map.stats.preservedArtifacts,
      diagnostics: map.stats.diagnostics,
      byDomain: {
        production: map.stats.byDomain.production,
        build: map.stats.byDomain.build,
        tooling: map.stats.byDomain.tooling,
        test: map.stats.byDomain.test,
        migration: map.stats.byDomain.migration,
      },
    },
  };
}

function countProofLevels(map: ProjectRootsMap): Record<ProofLevel, number> {
  const counts: Record<ProofLevel, number> = {
    proven: 0,
    supported: 0,
    heuristic: 0,
    unresolved: 0,
  };
  for (const item of [...map.roots, ...map.candidates, ...map.preservedArtifacts]) counts[item.proof.level] += 1;
  return counts;
}

function countBy<T, K extends string>(items: T[], keyFor: (item: T) => K): Partial<Record<K, number>> {
  return items.reduce<Partial<Record<K, number>>>((counts, item) => {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function compareDiagnostics(a: ProjectRootsMap["diagnostics"][number], b: ProjectRootsMap["diagnostics"][number]): number {
  return a.detector.localeCompare(b.detector) || (a.path ?? "").localeCompare(b.path ?? "") || a.message.localeCompare(b.message);
}

async function sha256Hex(text: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return fallbackHash(text);
}

function fallbackHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
