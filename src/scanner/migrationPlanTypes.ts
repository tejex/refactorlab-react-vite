import type { ZipFileInput } from "./zipWriter";
import type { ProjectBlockerGroup } from "./projectBlockers";

export const migrationPlanRoot = "fixer-migration-plan";

export type MigrationPhaseStatus = "ready" | "blocked" | "review";

export interface MigrationPlanPhase {
  id: string;
  title: string;
  status: MigrationPhaseStatus;
  summary: string;
  facts: string[];
  files: string[];
  blockers: string[];
  blockerGroups?: ProjectBlockerGroup[];
}

export interface MigrationPlanStats {
  phases: number;
  readyPhases: number;
  reviewPhases: number;
  blockedPhases: number;
  routes: number;
  routePackets: number;
  componentOwners: number;
  behaviorBindings: number;
  blockers: number;
  verifiedRewrites: number;
  deadFiles: number;
  duplicateSelectors: number;
  outputFiles: number;
}

export interface MigrationPlanManifest {
  source: string;
  generatedAt: string;
  purpose: string;
  recommendedUse: string[];
  stats: MigrationPlanStats;
  files: string[];
}

export interface MigrationPlanPackBuild {
  files: ZipFileInput[];
  manifest: MigrationPlanManifest;
  stats: MigrationPlanStats;
  phases: MigrationPlanPhase[];
}
