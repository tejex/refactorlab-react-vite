import type { AiContextPackStats } from "./aiContextPack";
import type { MigrationPlanStats } from "./migrationPlanPack";
import type { RouteStarterPackStats } from "./routeStarterPack";
import type { ZipFileInput } from "./zipWriter";

export const conversionKitRoot = "fixer-conversion-kit";

export interface ConversionKitStats {
  packageMode: "llm-slim";
  outputFiles: number;
  routes: number;
  routePackets: number;
  blockers: number;
  assetManifestAssets: number;
  missingAssetReferences: number;
  verifiedRewriteApplied: number;
  verifiedRewritePackageFiles: number;
  omittedVerifiedRewriteFiles: number;
  omittedVerifiedRewriteBytes: number;
  contextTokenReduction: number;
  migrationPhases: number;
  routeStarterRoute: string | null;
}

export interface ConversionKitManifest {
  source: string;
  generatedAt: string;
  purpose: string;
  targetProfile: ConversionTargetProfile;
  stats: ConversionKitStats;
  sections: ConversionKitSection[];
  files: string[];
}

export interface ConversionKitSection {
  id: string;
  path: string;
  purpose: string;
  status: "included" | "summarized" | "skipped";
}

export interface ConversionTargetProfile {
  framework: "Next.js App Router";
  componentSyntax: "TSX scaffold";
  styling: "CSS modules plus existing class names first";
  conversionMode: "route-by-route";
}

export interface ConversionKitBuild {
  files: ZipFileInput[];
  manifest: ConversionKitManifest;
  stats: ConversionKitStats;
}

export type RouteQueueStatus = "start" | "ready" | "review" | "blocked";
export type RouteQueueDifficulty = "easy" | "medium" | "hard" | "blocked";

export interface RouteQueueItem {
  order: number;
  routePath: string;
  sourceFile: string;
  status: RouteQueueStatus;
  difficulty: RouteQueueDifficulty;
  reason: string;
  packetPath: string;
  starterPath: string | null;
  componentOwners: number;
  sharedComponentOwners: number;
  behaviorBindings: number;
  blockers: number;
  dependsOn: string[];
  suggestedNext: string[];
  suggestedOrder: string[];
}

export interface ConversionKitSourceStats {
  context: AiContextPackStats;
  migration: MigrationPlanStats;
  routeStarter: RouteStarterPackStats;
  verifiedRewriteApplied: number;
}
