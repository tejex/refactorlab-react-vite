import { readZipProjectEntries, type ZipProjectEntry, type ZipTextFile } from "./browserZip";
import { downloadZip, type ZipFileInput } from "./zipWriter";
import { buildProjectMap, buildRetrievalManifest, factsFilesForReport, routePacketFiles } from "./aiContextPackContent";
import { conversionPlanMarkdown, llmPromptMarkdown } from "./aiContextPackMarkdown";
import { buildSourceIndex, buildSourceReferences } from "./aiContextPackReferences";
import {
  contextPackRoot,
  maxContextReferences,
  maxContextSnippets,
  maxSnippetChars,
  maxSnippetLines,
  type AiContextPackBuild,
  type AiContextPackManifest,
  type AiContextPackStats,
  type SourceReferenceRecord,
} from "./aiContextPackTypes";
import type { ProjectReport } from "./types";

export type {
  AiContextPackBuild,
  AiContextPackManifest,
  AiContextPackStats,
  SourceIndexEntry,
  SourceReferenceRecord,
} from "./aiContextPackTypes";

const textEncoder = new TextEncoder();

export async function buildAiContextPackArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<AiContextPackBuild> {
  const project = await readZipProjectEntries(await archive.arrayBuffer(), onLog);
  const contextPack = buildAiContextPackFromEntries(project.entries, project.textFiles, report);
  onLog(`contextRoutes=${contextPack.stats.routePackets.toLocaleString()}`);
  onLog(`contextRefs=${contextPack.stats.sourceReferences.toLocaleString()}`);
  onLog(`contextSnippets=${contextPack.stats.sourceSnippets.toLocaleString()}`);
  return contextPack;
}

export async function downloadAiContextPackArchive(
  archive: File | Blob,
  report: ProjectReport,
  onLog: (message: string) => void = () => undefined,
): Promise<AiContextPackBuild> {
  const contextPack = await buildAiContextPackArchive(archive, report, onLog);
  downloadZip(contextPack.files, "fixer-ai-context-pack.zip");
  return contextPack;
}

export function buildAiContextPackFromEntries(
  entries: ZipProjectEntry[],
  textFiles: ZipTextFile[],
  report: ProjectReport,
): AiContextPackBuild {
  const sourceIndex = buildSourceIndex(textFiles);
  const sourceTextByPath = new Map(textFiles.map((file) => [file.path, file.text]));
  const { references, snippetFiles } = buildSourceReferences(report, sourceTextByPath);
  const sourceTextBytes = textFiles.reduce((total, file) => total + file.bytes, 0);
  const baseFiles: ZipFileInput[] = [
    jsonFile("project-map.json", buildProjectMap(report, references)),
    jsonFile("source-index.json", sourceIndex),
    jsonFile("retrieval-manifest.json", buildRetrievalManifest(references)),
    { path: `${contextPackRoot}/conversion-plan.md`, content: conversionPlanMarkdown(report) },
    { path: `${contextPackRoot}/llm-prompt.md`, content: llmPromptMarkdown(report) },
    ...routePacketFiles(report, references),
    ...factsFilesForReport(report),
    ...snippetFiles,
  ];
  const baseStats = buildStats({
    entries,
    report,
    references,
    snippetFiles,
    sourceTextBytes,
    outputFiles: baseFiles.length + 1,
    packTextBytes: 0,
  });
  const preliminaryFiles = [
    {
      path: `${contextPackRoot}/context-pack-manifest.json`,
      content: `${JSON.stringify(buildManifest(report, baseStats, [""]), null, 2)}\n`,
    },
    ...baseFiles,
  ];
  const finalPackTextBytes = byteLengthOfFiles(preliminaryFiles);
  const finalStats = {
    ...baseStats,
    packTextBytes: finalPackTextBytes,
    estimatedPackTokens: estimateTokens(finalPackTextBytes),
    estimatedTokenReduction: estimateReduction(baseStats.sourceTextBytes, finalPackTextBytes),
  };
  const finalFiles = withManifest(preliminaryFiles, report, finalStats);

  return {
    files: finalFiles,
    manifest: buildManifest(report, finalStats, finalFiles.map((file) => file.path)),
    stats: finalStats,
    sourceIndex,
    sourceReferences: references,
  };
}

function buildStats(input: {
  entries: ZipProjectEntry[];
  report: ProjectReport;
  references: SourceReferenceRecord[];
  snippetFiles: ZipFileInput[];
  sourceTextBytes: number;
  outputFiles: number;
  packTextBytes: number;
}): AiContextPackStats {
  const map = input.report.reactConversionMap;
  return {
    sourceFiles: input.entries.filter((entry) => entry.text !== null).length,
    routes: map?.routes.length ?? 0,
    routePackets: map?.routePackets.length ?? 0,
    componentOwners: map?.componentOwnership.length ?? 0,
    behaviorBindings: map?.behaviorBindings.length ?? 0,
    blockers: map?.blockers.length ?? 0,
    verifiedRewrites: input.report.inlineAssetPlan?.guaranteedSafeChanges.length ?? 0,
    sourceReferences: input.references.length,
    sourceSnippets: input.snippetFiles.length,
    outputFiles: input.outputFiles,
    sourceTextBytes: input.sourceTextBytes,
    packTextBytes: input.packTextBytes,
    estimatedSourceTokens: estimateTokens(input.sourceTextBytes),
    estimatedPackTokens: estimateTokens(input.packTextBytes),
    estimatedTokenReduction: estimateReduction(input.sourceTextBytes, input.packTextBytes),
  };
}

function buildManifest(report: ProjectReport, stats: AiContextPackStats, files: string[]): AiContextPackManifest {
  return {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    purpose: "Parser-backed context pack for handing a static project to an AI converter without making it scan blindly.",
    recommendedUse: [
      "Read project-map.json first.",
      "Pick a route from routes/index.json.",
      "Use the route packet and sourceReferences before opening raw source files.",
      "Use source-snippets as a fast preview, then expand to original files only when needed.",
      "Apply verified rewrites before large framework conversion when possible.",
    ],
    limits: {
      maxReferences: maxContextReferences,
      maxSnippets: maxContextSnippets,
      maxSnippetLines,
      maxSnippetChars,
    },
    stats,
    files: files.filter(Boolean),
  };
}

function withManifest(files: ZipFileInput[], report: ProjectReport, stats: AiContextPackStats): ZipFileInput[] {
  return files.map((file) =>
    file.path.endsWith("/context-pack-manifest.json")
      ? {
          path: file.path,
          content: `${JSON.stringify(buildManifest(report, stats, files.map((packFile) => packFile.path)), null, 2)}\n`,
        }
      : file,
  );
}

function jsonFile(path: string, value: unknown): ZipFileInput {
  return {
    path: `${contextPackRoot}/${path}`,
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function byteLengthOfFiles(files: ZipFileInput[]): number {
  return files.reduce((total, file) => total + (typeof file.content === "string" ? textEncoder.encode(file.content).byteLength : file.content.byteLength), 0);
}

function estimateTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}

function estimateReduction(sourceBytes: number, packBytes: number): number {
  if (!sourceBytes || !packBytes) return 0;
  return Math.max(0, Math.round((1 - packBytes / sourceBytes) * 100));
}
