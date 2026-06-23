import { buildAiContextPackArchive, type AiContextPackBuild } from "./aiContextPack";
import { buildConversionAssetManifest } from "./conversionAssetManifest";
import { buildMigrationPlanPack, type MigrationPlanPackBuild } from "./migrationPlanPack";
import { buildRouteStarterPack, type RouteStarterPackBuild } from "./routeStarterPack";
import type { ProjectReport } from "./types";
import { buildVerifiedRewriteArchive, type VerifiedRewriteArchive } from "./verifiedRewriteEngine";
import { downloadZip, type ZipFileInput } from "./zipWriter";
import { llmHandoffMarkdown, readThisFirstMarkdown, routeQueue, targetProfileJson } from "./conversionKitContent";
import {
  conversionKitRoot,
  type ConversionKitBuild,
  type ConversionKitManifest,
  type ConversionKitSection,
  type ConversionKitStats,
} from "./conversionKitTypes";

export type { ConversionKitBuild, ConversionKitManifest, ConversionKitStats } from "./conversionKitTypes";

export async function buildConversionKitArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<ConversionKitBuild> {
  const [contextPack, verifiedRewrite] = await Promise.all([
    buildAiContextPackArchive(archive, report, onLog),
    tryBuildVerifiedRewriteArchive(archive, report, onLog),
  ]);
  const migrationPlan = buildMigrationPlanPack(report);
  const routeStarter = buildRouteStarterPack(report);
  const kit = buildConversionKitFromArtifacts(report, {
    contextPack,
    migrationPlan,
    routeStarter,
    verifiedRewrite,
  });

  onLog(`conversionKitFiles=${kit.files.length.toLocaleString()}`);
  onLog(`conversionKitMode=${kit.stats.packageMode}`);
  onLog(`conversionKitOmittedRewriteFiles=${kit.stats.omittedVerifiedRewriteFiles.toLocaleString()}`);
  onLog(`conversionKitRoutes=${kit.stats.routePackets.toLocaleString()}`);
  return kit;
}

export function buildConversionKitFromArtifacts(
  report: ProjectReport,
  artifacts: {
    contextPack: AiContextPackBuild;
    migrationPlan: MigrationPlanPackBuild;
    routeStarter: RouteStarterPackBuild;
    verifiedRewrite: VerifiedRewriteArchive | null;
  },
): ConversionKitBuild {
  const targetProfile = targetProfileJson();
  const sections = buildSections(Boolean(artifacts.verifiedRewrite));
  const assetManifest = buildConversionAssetManifest(report, artifacts.verifiedRewrite);
  const verifiedRewriteFiles = artifacts.verifiedRewrite
    ? verifiedRewriteSummaryFiles(artifacts.verifiedRewrite)
    : [jsonFile("verified-rewrite/skipped.json", { reason: "No verified rewrite was available." })];
  const baseFiles: ZipFileInput[] = [
    jsonFile("target-profile.json", targetProfile),
    jsonFile("capability-map.json", report.capabilityMap ?? null),
    jsonFile("route-queue.json", routeQueue(report)),
    jsonFile("asset-manifest.json", assetManifest),
    { path: `${conversionKitRoot}/llm-handoff.md`, content: llmHandoffMarkdown(report, targetProfile) },
    ...verifiedRewriteFiles,
    ...prefixFiles(artifacts.contextPack.files, "fixer-ai-context-pack", "ai-context-pack"),
    ...prefixFiles(artifacts.migrationPlan.files, "fixer-migration-plan", "migration-plan"),
    ...prefixFiles(artifacts.routeStarter.files, "fixer-route-starter-pack", "route-starter-pack"),
  ];
  const finalStats = buildStats(
    report,
    artifacts.contextPack,
    artifacts.migrationPlan,
    artifacts.routeStarter,
    artifacts.verifiedRewrite,
    baseFiles.length + 2,
    assetManifest.assetCount,
    assetManifest.missingAssetReferences.length,
  );
  const manifest = buildManifest(report, targetProfile, sections, finalStats, [
    `${conversionKitRoot}/conversion-kit-manifest.json`,
    `${conversionKitRoot}/00-read-this-first.md`,
    ...baseFiles.map((file) => file.path),
  ]);
  const files = [
    { path: `${conversionKitRoot}/conversion-kit-manifest.json`, content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: `${conversionKitRoot}/00-read-this-first.md`, content: readThisFirstMarkdown(manifest) },
    ...baseFiles,
  ];

  return { files, manifest, stats: finalStats };
}

export async function downloadConversionKitArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<ConversionKitBuild> {
  const kit = await buildConversionKitArchive(archive, report, onLog);
  downloadZip(kit.files, "fixer-conversion-kit.zip");
  return kit;
}

function buildManifest(
  report: ProjectReport,
  targetProfile: ConversionKitManifest["targetProfile"],
  sections: ConversionKitSection[],
  stats: ConversionKitStats,
  files: string[],
): ConversionKitManifest {
  return {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    purpose: "Single handoff package for route-by-route React or Next.js conversion using parser facts.",
    targetProfile,
    stats,
    sections,
    files,
  };
}

function buildStats(
  report: ProjectReport,
  contextPack: AiContextPackBuild,
  migrationPlan: MigrationPlanPackBuild,
  routeStarter: RouteStarterPackBuild,
  verifiedRewrite: VerifiedRewriteArchive | null,
  outputFiles: number,
  assetManifestAssets: number,
  missingAssetReferences: number,
): ConversionKitStats {
  return {
    packageMode: "llm-slim",
    outputFiles,
    routes: report.reactConversionMap?.routes.length ?? 0,
    routePackets: report.reactConversionMap?.routePackets.length ?? 0,
    blockers: report.reactConversionMap?.blockers.length ?? 0,
    assetManifestAssets,
    missingAssetReferences,
    verifiedRewriteApplied: verifiedRewrite?.manifest.applied.length ?? 0,
    verifiedRewritePackageFiles: verifiedRewrite?.files.length ?? 0,
    omittedVerifiedRewriteFiles: verifiedRewrite ? Math.max(0, verifiedRewrite.files.length - verifiedRewriteSummaryFiles(verifiedRewrite).length) : 0,
    omittedVerifiedRewriteBytes: verifiedRewrite ? omittedVerifiedRewriteBytes(verifiedRewrite) : 0,
    contextTokenReduction: contextPack.stats.estimatedTokenReduction,
    migrationPhases: migrationPlan.stats.phases,
    routeStarterRoute: routeStarter.stats.routePath,
  };
}

async function tryBuildVerifiedRewriteArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void,
): Promise<VerifiedRewriteArchive | null> {
  try {
    return await buildVerifiedRewriteArchive(archive, report, onLog);
  } catch (error) {
    onLog(`verifiedRewriteSkipped=${error instanceof Error ? error.message : "unavailable"}`);
    return null;
  }
}

function buildSections(hasVerifiedRewrite: boolean): ConversionKitSection[] {
  return [
    {
      id: "verified-rewrite",
      path: "verified-rewrite/",
      purpose: "Parser-verified rewrite summary. Full rewritten files stay in the separate verified rewrite download.",
      status: hasVerifiedRewrite ? "summarized" : "skipped",
    },
    { id: "ai-context-pack", path: "ai-context-pack/", purpose: "Compact source facts and retrieval references.", status: "included" },
    { id: "migration-plan", path: "migration-plan/", purpose: "Ordered human and AI conversion phases.", status: "included" },
    { id: "route-starter-pack", path: "route-starter-pack/", purpose: "Starter scaffold for the first route.", status: "included" },
  ];
}

function verifiedRewriteSummaryFiles(rewrite: VerifiedRewriteArchive): ZipFileInput[] {
  const summary = {
    source: rewrite.manifest.source,
    generatedAt: rewrite.manifest.generatedAt,
    engine: rewrite.manifest.engine,
    packageMode: "summary-only",
    note: "The LLM conversion kit omits the full verified rewrite file tree to stay small. Download fixer-verified-rewrite.zip when the complete rewritten project output is needed.",
    originalFilesPreserved: rewrite.manifest.originalFilesPreserved,
    fullRewritePackageFiles: rewrite.files.length,
    fullRewritePackageBytes: totalContentBytes(rewrite.files),
    appliedCount: rewrite.manifest.applied.length,
    rejectedCount: rewrite.manifest.rejected.length,
    excludedOriginalFilesCount: rewrite.manifest.excludedOriginalFiles.length,
    applied: rewrite.manifest.applied,
    rejected: rewrite.manifest.rejected,
    excludedOriginalFiles: rewrite.manifest.excludedOriginalFiles,
  };

  return [
    {
      path: `${conversionKitRoot}/verified-rewrite/README.md`,
      content: `# Verified Rewrite Summary

This folder is intentionally summary-only so the Conversion Kit stays small enough for LLM handoff.

The full parser-verified rewritten project is available from the separate fixer-verified-rewrite.zip download.

Use rewrite-summary.json to see every applied and rejected parser rewrite. Use changed-files.json to see which source files produced generated CSS or JS outputs.
`,
    },
    jsonFile("verified-rewrite/rewrite-summary.json", summary),
    jsonFile("verified-rewrite/changed-files.json", rewriteChangedFiles(rewrite)),
  ];
}

function rewriteChangedFiles(rewrite: VerifiedRewriteArchive) {
  const files = new Map<
    string,
    {
      sourceFile: string;
      generatedFiles: string[];
      rewriteCount: number;
    }
  >();

  for (const change of rewrite.manifest.applied) {
    const current = files.get(change.sourceFile) ?? {
      sourceFile: change.sourceFile,
      generatedFiles: [],
      rewriteCount: 0,
    };
    current.rewriteCount += 1;
    current.generatedFiles.push(change.targetFile);
    files.set(change.sourceFile, current);
  }

  return [...files.values()].map((file) => ({
    ...file,
    generatedFiles: [...new Set(file.generatedFiles)].sort(),
  }));
}

function prefixFiles(files: ZipFileInput[], oldRoot: string, nextRoot: string): ZipFileInput[] {
  return files.map((file) => ({
    path: file.path.replace(new RegExp(`^${oldRoot}/?`), `${conversionKitRoot}/${nextRoot}/`),
    content: file.content,
  }));
}

function jsonFile(path: string, value: unknown): ZipFileInput {
  return {
    path: `${conversionKitRoot}/${path}`,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function totalContentBytes(files: ZipFileInput[]): number {
  return files.reduce((total, file) => total + contentByteLength(file.content), 0);
}

function omittedVerifiedRewriteBytes(rewrite: VerifiedRewriteArchive): number {
  return Math.max(0, totalContentBytes(rewrite.files) - totalContentBytes(verifiedRewriteSummaryFiles(rewrite)));
}

function contentByteLength(content: ZipFileInput["content"]): number {
  return typeof content === "string" ? new TextEncoder().encode(content).byteLength : content.byteLength;
}
