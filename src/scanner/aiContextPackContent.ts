import type { ZipFileInput } from "./zipWriter";
import type { ProjectReport, RouteConversionPacket } from "./types";
import { contextPackRoot, type SourceReferenceRecord } from "./aiContextPackTypes";
import { routePacketPromptMarkdown } from "./aiContextPackMarkdown";
import { groupProjectBlockers } from "./projectBlockers";
import {
  behaviorBindingFact,
  compactJsTsModuleMap,
  compactRoutePacket,
  componentOwnerFact,
  componentOwnerIndex,
  packetIndexEntry,
  safeChangeFact,
  summarizeBehaviorBindings,
} from "./aiContextPackCompact";

const textEncoder = new TextEncoder();

export function buildProjectMap(report: ProjectReport, references: SourceReferenceRecord[]) {
  const conversionMap = report.reactConversionMap;
  const verifiedChanges = report.inlineAssetPlan?.guaranteedSafeChanges ?? [];
  return {
    source: report.sourceName,
    summary: report.summary,
    readinessScore: report.score,
    stats: {
      routes: conversionMap?.routes.length ?? 0,
      routePackets: conversionMap?.routePackets.length ?? 0,
      componentOwners: conversionMap?.componentOwnership.length ?? 0,
      behaviorBindings: conversionMap?.behaviorBindings.length ?? 0,
      blockers: conversionMap?.blockers.length ?? 0,
      verifiedRewrites: verifiedChanges.length,
      sourceReferences: references.length,
      deadFiles: report.deadCodeMap?.unreachableFiles.length ?? 0,
      duplicateSelectors: report.duplicateCssMap?.repeatedSelectors.length ?? 0,
    },
    routes: conversionMap?.routes ?? [],
    routePackets: conversionMap?.routePackets.map(packetIndexEntry) ?? [],
    aiHandoff: conversionMap?.aiHandoff ?? null,
    capabilityMap: report.capabilityMap ?? null,
    componentCandidates: conversionMap?.componentCandidates.slice(0, 80) ?? [],
    componentOwnership: conversionMap?.componentOwnership.map(componentOwnerIndex) ?? [],
    behaviorFiles: conversionMap?.behaviorFiles ?? [],
    behaviorBindingsByFile: summarizeBehaviorBindings(conversionMap?.behaviorBindings ?? []),
    conversionBlockers: conversionMap?.blockers ?? [],
    sourceReferences: {
      count: references.length,
      retrievalManifestPath: "retrieval-manifest.json",
      snippetDirectory: "source-snippets/",
    },
    verifiedSafeChanges:
      verifiedChanges.map((change) => ({
        sourceFile: change.file,
        targetPath: change.targetPath,
        kind: change.kind,
        lineStart: change.lineStart,
        lineEnd: change.lineEnd,
        sourceLines: change.sourceLines,
        action: change.action,
        contentBytes: textEncoder.encode(change.content).byteLength,
      })) ?? [],
    integrity: report.integrityMap ? projectIntegrityFact(report) : null,
    jsTsModuleMap: report.jsTsModuleMap ? compactJsTsModuleMap(report.jsTsModuleMap) : null,
    deadCode: report.deadCodeMap
      ? {
          entrypoints: report.deadCodeMap.entrypoints,
          unreachableFiles: report.deadCodeMap.unreachableFiles,
          reachableCount: report.deadCodeMap.reachableFiles.length,
        }
      : null,
    duplicateCss: report.duplicateCssMap
      ? {
          repeatedSelectors: report.duplicateCssMap.repeatedSelectors.slice(0, 20),
          totalRepeatedSelectors: report.duplicateCssMap.repeatedSelectors.length,
        }
      : null,
    factFiles: [
      "facts/verified-rewrites.json",
      "facts/component-ownership.json",
      "facts/behavior-bindings.json",
      "facts/project-integrity.json",
      "facts/js-ts-module-map.json",
      "facts/dead-code.json",
      "facts/duplicate-css.json",
    ],
  };
}

export function buildRetrievalManifest(references: SourceReferenceRecord[]) {
  return {
    instructions: [
      "Start with project-map.json and the route packet for the page being converted.",
      "Use sourceRef values to locate exact original file ranges.",
      "Use source-snippets only as a fast preview. If a snippet is missing or capped, read the original source range.",
      "Treat parser facts as evidence, not as permission to invent code that is not present in the project.",
    ],
    sourceReferences: references,
  };
}

export function routePacketFiles(report: ProjectReport, references: SourceReferenceRecord[]): ZipFileInput[] {
  const packets = report.reactConversionMap?.routePackets ?? [];
  if (!packets.length) return [];

  return [
    {
      path: `${contextPackRoot}/routes/index.json`,
      content: `${JSON.stringify(packets.map(packetIndexEntry), null, 2)}\n`,
    },
    ...packets.flatMap((packet) => routePacketFilePair(packet, references)),
  ];
}

export function factsFilesForReport(report: ProjectReport): ZipFileInput[] {
  return [
    jsonFile("facts/verified-rewrites.json", report.inlineAssetPlan?.guaranteedSafeChanges.map(safeChangeFact) ?? []),
    jsonFile("facts/component-ownership.json", report.reactConversionMap?.componentOwnership.map(componentOwnerFact) ?? []),
    jsonFile("facts/behavior-bindings.json", report.reactConversionMap?.behaviorBindings.map(behaviorBindingFact) ?? []),
    jsonFile("facts/project-integrity.json", projectIntegrityFact(report)),
    jsonFile("facts/js-ts-module-map.json", report.jsTsModuleMap ? compactJsTsModuleMap(report.jsTsModuleMap) : { files: [], resolvedImports: [], unresolvedImports: [] }),
    jsonFile("facts/dead-code.json", report.deadCodeMap ?? { entrypoints: [], reachableFiles: [], unreachableFiles: [] }),
    jsonFile("facts/duplicate-css.json", report.duplicateCssMap ?? { repeatedSelectors: [] }),
  ];
}

function routePacketFilePair(packet: RouteConversionPacket, references: SourceReferenceRecord[]): ZipFileInput[] {
  const packetRefs = references.filter(
    (reference) =>
      reference.sourceFile === normalizePath(packet.sourceFile) ||
      packet.componentOwners.some((owner) => owner.locators.some((locator) => normalizePath(locator.sourceFile) === reference.sourceFile)),
  );

  return [
    {
      path: `${contextPackRoot}/routes/${packet.slug}.json`,
      content: `${JSON.stringify(compactRoutePacket(packet, packetRefs), null, 2)}\n`,
    },
    {
      path: `${contextPackRoot}/routes/${packet.slug}-prompt.md`,
      content: routePacketPromptMarkdown(packet, packetRefs),
    },
  ];
}

function projectIntegrityFact(report: ProjectReport) {
  const missingReferences = report.integrityMap?.missingReferences ?? [];
  return {
    missingReferences,
    blockerGroups: groupProjectBlockers(missingReferences),
  };
}

function jsonFile(path: string, value: unknown): ZipFileInput {
  return {
    path: `${contextPackRoot}/${path}`,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function normalizePath(path: string): string {
  return path.split("/").filter(Boolean).join("/");
}
