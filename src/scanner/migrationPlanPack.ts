import { downloadZip, type ZipFileInput } from "./zipWriter";
import {
  aiInstructionsMarkdown,
  currentProjectMapMarkdown,
  invariantsMarkdown,
  overviewMarkdown,
  phaseMarkdown,
  testGatesMarkdown,
} from "./migrationPlanMarkdown";
import {
  migrationPlanRoot,
  type MigrationPhaseStatus,
  type MigrationPlanManifest,
  type MigrationPlanPackBuild,
  type MigrationPlanPhase,
  type MigrationPlanStats,
} from "./migrationPlanTypes";
import { collectProjectBlockers, formatProjectBlocker, formatProjectBlockerGroup, groupProjectBlockers } from "./projectBlockers";
import type { ProjectReport } from "./types";

export type { MigrationPlanManifest, MigrationPlanPackBuild, MigrationPlanPhase, MigrationPlanStats } from "./migrationPlanTypes";

export function buildMigrationPlanPack(report: ProjectReport): MigrationPlanPackBuild {
  const phases = buildMigrationPhases(report);
  const baseStats = buildStats(report, phases, 0);
  const baseFiles: ZipFileInput[] = [
    jsonFile("migration-plan.json", buildPlanJson(report, phases, baseStats)),
    { path: `${migrationPlanRoot}/00-overview.md`, content: overviewMarkdown(report, baseStats, phases) },
    { path: `${migrationPlanRoot}/01-invariants.md`, content: invariantsMarkdown(report) },
    { path: `${migrationPlanRoot}/02-current-project-map.md`, content: currentProjectMapMarkdown(report, baseStats) },
    ...phases.map((phase, index) => ({
      path: `${migrationPlanRoot}/${String(index + 3).padStart(2, "0")}-${phase.id}.md`,
      content: phaseMarkdown(phase),
    })),
    { path: `${migrationPlanRoot}/09-test-gates.md`, content: testGatesMarkdown(report, phases) },
    { path: `${migrationPlanRoot}/10-ai-instructions.md`, content: aiInstructionsMarkdown(report, phases) },
  ];
  const finalStats = buildStats(report, phases, baseFiles.length + 1);
  const manifest = buildManifest(report, finalStats, [
    `${migrationPlanRoot}/migration-plan-manifest.json`,
    ...baseFiles.map((file) => file.path),
  ]);
  const files = [
    {
      path: `${migrationPlanRoot}/migration-plan-manifest.json`,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    ...baseFiles.map((file) =>
      file.path.endsWith("/migration-plan.json")
        ? {
            path: file.path,
            content: `${JSON.stringify(buildPlanJson(report, phases, finalStats), null, 2)}\n`,
          }
        : file,
    ),
  ];

  return { files, manifest, stats: finalStats, phases };
}

export function downloadMigrationPlanPack(report: ProjectReport): MigrationPlanPackBuild {
  const plan = buildMigrationPlanPack(report);
  downloadZip(plan.files, "fixer-migration-plan.zip");
  return plan;
}

function buildMigrationPhases(report: ProjectReport): MigrationPlanPhase[] {
  const map = report.reactConversionMap;
  const projectBlockers = collectProjectBlockers(report);
  const projectBlockerGroups = groupProjectBlockers(projectBlockers);
  const verifiedRewrites = report.inlineAssetPlan?.guaranteedSafeChanges ?? [];
  const deadFiles = report.deadCodeMap?.unreachableFiles ?? [];
  const duplicateSelectors = report.duplicateCssMap?.repeatedSelectors ?? [];
  const jsTsFiles = report.jsTsModuleMap?.files ?? [];

  return [
    {
      id: "phase-a-verified-rewrites",
      title: "Phase A: Apply verified rewrites",
      status: verifiedRewrites.length ? "ready" : "review",
      summary: "Use parser-verified extraction output before asking an AI to convert the app structure.",
      facts: [
        `${verifiedRewrites.length.toLocaleString()} verified copy-only rewrite(s)`,
        `${report.inlineAssetPlan?.blocks.length ?? 0} inline asset block(s) found`,
      ],
      files: unique(verifiedRewrites.flatMap((change) => [change.file, change.targetPath])),
      blockers: [],
    },
    {
      id: "phase-b-project-integrity",
      title: "Phase B: Clear project blockers",
      status: projectBlockers.length ? "blocked" : "ready",
      summary: "Fix missing local references and unresolved imports before treating framework conversion as reliable.",
      facts: [
        `${projectBlockers.length.toLocaleString()} blocker(s) found`,
        `${projectBlockerGroups.length.toLocaleString()} unique blocker target(s)`,
        ...projectBlockerGroups.slice(0, 3).map(formatProjectBlockerGroup),
      ],
      files: unique(projectBlockers.map((blocker) => blocker.sourceFile)),
      blockers: projectBlockers.map(formatProjectBlocker),
      blockerGroups: projectBlockerGroups,
    },
    {
      id: "phase-c-route-conversion",
      title: "Phase C: Convert route by route",
      status: map?.routePackets.length ? "ready" : "review",
      summary: "Use route packets as the conversion units so the target app is built in small, checkable pieces.",
      facts: [`${map?.routes.length ?? 0} route candidate(s)`, `${map?.routePackets.length ?? 0} route packet(s)`],
      files: unique(map?.routePackets.map((packet) => packet.sourceFile) ?? []),
      blockers: [],
    },
    {
      id: "phase-d-component-ownership",
      title: "Phase D: Extract owned components",
      status: componentOwnershipStatus(report),
      summary: "Use repeated DOM ownership groups to decide which components should exist after route shells work.",
      facts: [
        `${map?.componentOwnership.length ?? 0} ownership group(s)`,
        `${map?.componentCandidates.length ?? 0} component candidate(s)`,
      ],
      files: unique(map?.componentOwnership.flatMap((owner) => owner.sourceFiles) ?? []),
      blockers: [],
    },
    {
      id: "phase-e-behavior-conversion",
      title: "Phase E: Preserve behavior",
      status: behaviorStatus(report),
      summary: "Map events, DOM mutations, render updates, and endpoints into the target framework after routes exist.",
      facts: [`${map?.behaviorBindings.length ?? 0} behavior binding(s)`, `${jsTsFiles.length} JS/TS module file(s)`],
      files: unique([...(map?.behaviorBindings.map((binding) => binding.sourceFile) ?? []), ...jsTsFiles.map((file) => file.path)]),
      blockers: [],
    },
    {
      id: "phase-f-cleanup-after-conversion",
      title: "Phase F: Cleanup after conversion",
      status: deadFiles.length || duplicateSelectors.length ? "review" : "ready",
      summary: "Use dead file and duplicate CSS facts after the converted routes are passing.",
      facts: [`${deadFiles.length.toLocaleString()} dead file candidate(s)`, `${duplicateSelectors.length.toLocaleString()} repeated CSS selector(s)`],
      files: unique(deadFiles.map((file) => file.path)),
      blockers: [],
    },
  ];
}

function buildStats(report: ProjectReport, phases: MigrationPlanPhase[], outputFiles: number): MigrationPlanStats {
  const map = report.reactConversionMap;
  return {
    phases: phases.length,
    readyPhases: phases.filter((phase) => phase.status === "ready").length,
    reviewPhases: phases.filter((phase) => phase.status === "review").length,
    blockedPhases: phases.filter((phase) => phase.status === "blocked").length,
    routes: map?.routes.length ?? 0,
    routePackets: map?.routePackets.length ?? 0,
    componentOwners: map?.componentOwnership.length ?? 0,
    behaviorBindings: map?.behaviorBindings.length ?? 0,
    blockers: collectProjectBlockers(report).length,
    verifiedRewrites: report.inlineAssetPlan?.guaranteedSafeChanges.length ?? 0,
    deadFiles: report.deadCodeMap?.unreachableFiles.length ?? 0,
    duplicateSelectors: report.duplicateCssMap?.repeatedSelectors.length ?? 0,
    outputFiles,
  };
}

function buildPlanJson(report: ProjectReport, phases: MigrationPlanPhase[], stats: MigrationPlanStats) {
  return {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    summary: report.summary,
    score: report.score,
    stats,
    phases,
  };
}

function buildManifest(report: ProjectReport, stats: MigrationPlanStats, files: string[]): MigrationPlanManifest {
  return {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    purpose: "Deterministic migration plan for converting parser facts into an ordered React or Next.js handoff.",
    recommendedUse: [
      "Read migration-plan.json first.",
      "Resolve blocked phases before broad conversion.",
      "Convert one route packet at a time.",
      "Use component ownership and behavior bindings before asking an AI to infer structure.",
    ],
    stats,
    files,
  };
}

function componentOwnershipStatus(report: ProjectReport): MigrationPhaseStatus {
  const map = report.reactConversionMap;
  if (map?.componentOwnership.length) return "ready";
  if (map?.componentCandidates.length) return "review";
  return "review";
}

function behaviorStatus(report: ProjectReport): MigrationPhaseStatus {
  const map = report.reactConversionMap;
  if (map?.behaviorBindings.length) return "ready";
  if (report.jsTsModuleMap?.files.length) return "review";
  return "ready";
}

function jsonFile(path: string, value: unknown): ZipFileInput {
  return {
    path: `${migrationPlanRoot}/${path}`,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
