import { buildProjectRoots } from "../core/buildProjectRoots";
import { readZipProjectFiles } from "./browserZip";
import { analyzeFile, buildClusters, repeatedValues, summarizeParserFacts, sum } from "./analysisSummary";
import { buildInlineAssetPlan } from "./extractionPlan";
import { buildJsTsModuleMap } from "./jsTsModuleMap";
import { buildProjectCapabilityMap } from "./projectCapabilityMap";
import { buildDeadCodeMap, buildDuplicateCssMap, buildProjectIntegrityMap } from "./projectMaps";
import { buildReactConversionMap } from "./reactConversionMap";
import type { ProjectReport } from "./types";

export interface ProcessingStep {
  title: string;
  detail: string;
  facts?: string[];
}

export async function analyzeStaticZip(
  file: File | Blob,
  sourceName: string,
  onLog: (message: string) => void,
  onStep: (step: ProcessingStep) => void = () => undefined,
): Promise<ProjectReport> {
  onLog(`start=${sourceName}`);
  onStep({
    title: "1. Start",
    detail: sourceName,
    facts: ["cache=none"],
  });

  const projectFiles = await readZipProjectFiles(await file.arrayBuffer(), onLog);
  const files = projectFiles.textFiles;
  onStep({
    title: "2. ZIP",
    detail: `${files.length.toLocaleString()} source files`,
    facts: [
      "ext=.html,.css,.js,.ts",
      "ignore=node_modules,dist,build,.next,.vite,.git",
    ],
  });

  const analyses = files.map(analyzeFile).sort((a, b) => b.riskScore - a.riskScore);

  onLog(`files=${analyses.length.toLocaleString()}`);
  onLog("ignore=node_modules,dist,build,.next,.vite");
  onStep({
    title: "3. Parse",
    detail: `${analyses.length.toLocaleString()} files`,
    facts: summarizeParserFacts(analyses),
  });

  const topFile = analyses[0];
  const clusters = buildClusters(analyses);
  const duplicateSelectors = repeatedValues(analyses.flatMap((analysis) => analysis.selectors));
  const duplicateSymbols = repeatedValues(analyses.flatMap((analysis) => analysis.symbols));
  const inlineAssetPlan = buildInlineAssetPlan(files);
  const projectRootsMap = buildProjectRoots({ files, allPaths: projectFiles.allPaths });
  const deadCodeMap = buildDeadCodeMap(files);
  const duplicateCssMap = buildDuplicateCssMap(files);
  const integrityMap = buildProjectIntegrityMap(files, projectFiles.allPaths);
  const jsTsModuleMap = await buildJsTsModuleMap(files, projectFiles.allPaths);
  const reactConversionMap = buildReactConversionMap(files, inlineAssetPlan, integrityMap, jsTsModuleMap);
  const capabilityMap = buildProjectCapabilityMap(files, {
    htmlRoutes: reactConversionMap.routes.length,
    verifiedRewrites: inlineAssetPlan.guaranteedSafeChanges.length,
    cssFiles: files.filter((sourceFile) => sourceFile.path.toLowerCase().endsWith(".css")).length,
    jsFiles: files.filter((sourceFile) => /\.(js|jsx|mjs|cjs)$/i.test(sourceFile.path)).length,
    tsFiles: files.filter((sourceFile) => /\.(ts|tsx|mts|cts)$/i.test(sourceFile.path)).length,
    behaviorBindings: reactConversionMap.behaviorBindings.length,
    routePackets: reactConversionMap.routePackets.length,
  });
  const inlineStyleCount = inlineAssetPlan.blocks.filter((block) => block.kind === "style").length;
  const inlineScriptCount = inlineAssetPlan.blocks.filter((block) => block.kind === "script").length;
  const lowSafetyCount = inlineAssetPlan.blocks.filter((block) => block.safety === "Low").length;
  const guaranteedSafeCount = inlineAssetPlan.guaranteedSafeChanges.length;

  onLog(`top=${topFile?.path ?? "none"}`);
  onLog(`selectors=${duplicateSelectors.length.toLocaleString()}`);
  onLog(`symbols=${duplicateSymbols.length.toLocaleString()}`);
  onLog(`style=${inlineStyleCount.toLocaleString()}`);
  onLog(`script=${inlineScriptCount.toLocaleString()}`);
  onLog(`safe=${guaranteedSafeCount.toLocaleString()}`);
  onLog(`unreachable=${deadCodeMap.unreachableFiles.length.toLocaleString()}`);
  onLog(`duplicateCss=${duplicateCssMap.repeatedSelectors.length.toLocaleString()}`);
  onLog(`missingRefs=${integrityMap.missingReferences.length.toLocaleString()}`);
  onLog(`jsTsFiles=${jsTsModuleMap.files.length.toLocaleString()}`);
  onLog(`reactRoutes=${reactConversionMap.routes.length.toLocaleString()}`);
  onLog(`routePackets=${reactConversionMap.routePackets.length.toLocaleString()}`);
  onLog(`componentOwners=${reactConversionMap.componentOwnership.length.toLocaleString()}`);
  onLog(`behaviorBindings=${reactConversionMap.behaviorBindings.length.toLocaleString()}`);
  onLog(`projectRoots=${projectRootsMap.stats.roots.toLocaleString()}`);
  onLog(`rootCandidates=${projectRootsMap.stats.candidates.toLocaleString()}`);
  onLog(`preservedArtifacts=${projectRootsMap.stats.preservedArtifacts.toLocaleString()}`);
  onLog(`missingCapabilities=${capabilityMap.missing.toLocaleString()}`);
  onStep({
    title: "4. Rank",
    detail: topFile?.path ?? "none",
    facts: [
      `cluster=${clusters[0]?.name ?? "none"}`,
      `selectors=${duplicateSelectors.length.toLocaleString()}`,
      `symbols=${duplicateSymbols.length.toLocaleString()}`,
    ],
  });
  onStep({
    title: "5. Extract",
    detail: `${inlineAssetPlan.blocks.length.toLocaleString()} inline blocks`,
    facts: [
      `style=${inlineStyleCount.toLocaleString()}`,
      `script=${inlineScriptCount.toLocaleString()}`,
      `low=${lowSafetyCount.toLocaleString()}`,
      `safe=${guaranteedSafeCount.toLocaleString()}`,
      `first=${inlineAssetPlan.blocks.find((block) => block.safety === "High")?.recommendedPath ?? "none"}`,
    ],
  });
  onStep({
    title: "6. Reachability",
    detail: `${deadCodeMap.unreachableFiles.length.toLocaleString()} candidate unused file(s)`,
    facts: [
      `entrypoints=${deadCodeMap.entrypoints.length.toLocaleString()}`,
      `reachable=${deadCodeMap.reachableFiles.length.toLocaleString()}`,
      `review=${deadCodeMap.unreachableFiles.filter((candidate) => candidate.confidence === "Review").length.toLocaleString()}`,
      `duplicateCss=${duplicateCssMap.repeatedSelectors.length.toLocaleString()}`,
      `missingRefs=${integrityMap.missingReferences.length.toLocaleString()}`,
      `jsTsUnresolved=${jsTsModuleMap.unresolvedImports.length.toLocaleString()}`,
      `reactRoutes=${reactConversionMap.routes.length.toLocaleString()}`,
      `routePackets=${reactConversionMap.routePackets.length.toLocaleString()}`,
      `componentOwners=${reactConversionMap.componentOwnership.length.toLocaleString()}`,
      `behaviorBindings=${reactConversionMap.behaviorBindings.length.toLocaleString()}`,
      `projectRoots=${projectRootsMap.stats.roots.toLocaleString()}`,
      `rootCandidates=${projectRootsMap.stats.candidates.toLocaleString()}`,
      `missingCapabilities=${capabilityMap.missing.toLocaleString()}`,
    ],
  });

  return {
    sourceName,
    score: Math.max(15, Math.min(85, 100 - Math.round((topFile?.riskScore ?? 0) / 40))),
    summary: `${analyses.length.toLocaleString()} files / ${sum(analyses, "lines").toLocaleString()} lines`,
    evidence: {
      metrics: [
        { label: "Source files", value: analyses.length.toLocaleString() },
        { label: "Source lines", value: sum(analyses, "lines").toLocaleString() },
        { label: "Highest-risk file", value: topFile?.path ?? "none" },
        { label: "Repeated selectors", value: duplicateSelectors.length.toLocaleString() },
      ],
      clusters: clusters.slice(0, 6).map((cluster) => ({
        title: cluster.name,
        detail: `${cluster.files.toLocaleString()} files, ${cluster.lines.toLocaleString()} lines, risk ${cluster.riskScore.toLocaleString()}`,
      })),
      topFiles: analyses.slice(0, 10).map((analysis) => ({
        title: analysis.path,
        detail: `${analysis.lines.toLocaleString()} lines, risk ${analysis.riskScore.toLocaleString()}, ${analysis.tree.parser} tree ${analysis.tree.nodes.toLocaleString()} nodes`,
      })),
    },
    capabilityMap,
    inlineAssetPlan,
    deadCodeMap,
    duplicateCssMap,
    integrityMap,
    jsTsModuleMap,
    reactConversionMap,
    projectRootsMap,
  };
}
