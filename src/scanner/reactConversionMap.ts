import type { ZipTextFile } from "./browserZip";
import type { BehaviorBinding, InlineAssetPlan, JsTsModuleMap, ProjectIntegrityMap, ReactConversionMap } from "./types";
import {
  attachBehaviorBindingsToComponents,
  buildReactCandidateContext,
  buildReactComponentCandidates,
  confidenceRankForReactComponent,
} from "./reactComponentCandidates";
import { buildComponentOwnership, buildRouteConversionPackets } from "./reactComponentOwnership";
import { buildReactRoutes } from "./reactRouteFacts";
import { normalizeAssetPath } from "./scannerUtils";

export function buildReactConversionMap(
  files: ZipTextFile[],
  inlineAssetPlan: InlineAssetPlan,
  integrityMap: ProjectIntegrityMap,
  jsTsModuleMap: JsTsModuleMap,
): ReactConversionMap {
  const htmlFiles = files.filter((file) => normalizeAssetPath(file.path).endsWith(".html"));
  const routes = buildReactRoutes(htmlFiles, inlineAssetPlan);
  const componentContext = buildReactCandidateContext(files);
  const componentCandidates = htmlFiles
    .flatMap((file) => buildReactComponentCandidates(file, componentContext))
    .sort((a, b) => confidenceRankForReactComponent(a.confidence) - confidenceRankForReactComponent(b.confidence) || a.sourceFile.localeCompare(b.sourceFile))
    .slice(0, 120);
  const behaviorBindings = attachBehaviorBindingsToComponents(jsTsModuleMap.behaviorBindings, componentCandidates);
  const componentOwnership = buildComponentOwnership(files, routes, componentCandidates, behaviorBindings);
  const routePackets = buildRouteConversionPackets(routes, componentOwnership, behaviorBindings, integrityMap.missingReferences);
  const behaviorFiles = jsTsModuleMap.files
    .filter((file) => file.sideEffects > 0)
    .map((file) => ({ path: file.path, sideEffects: file.sideEffects }))
    .sort((a, b) => b.sideEffects - a.sideEffects || a.path.localeCompare(b.path));
  const aiHandoff = buildAiHandoffPlan({
    routes,
    routePackets,
    componentOwnership,
    behaviorFiles,
    behaviorBindings,
    blockers: integrityMap.missingReferences,
    safeChangeCount: inlineAssetPlan.guaranteedSafeChanges.length,
    unresolvedImportCount: jsTsModuleMap.unresolvedImports.length,
  });

  return {
    routes,
    routePackets,
    aiHandoff,
    componentCandidates,
    componentOwnership,
    behaviorFiles,
    behaviorBindings,
    blockers: integrityMap.missingReferences,
  };
}

interface AiHandoffInput {
  routes: ReactConversionMap["routes"];
  routePackets: ReactConversionMap["routePackets"];
  componentOwnership: ReactConversionMap["componentOwnership"];
  behaviorFiles: ReactConversionMap["behaviorFiles"];
  behaviorBindings: BehaviorBinding[];
  blockers: ProjectIntegrityMap["missingReferences"];
  safeChangeCount: number;
  unresolvedImportCount: number;
}

function buildAiHandoffPlan(input: AiHandoffInput): ReactConversionMap["aiHandoff"] {
  const primaryRoute = bestFirstRoutePacket(input.routePackets);
  const blockerCount = input.blockers.length + input.unresolvedImportCount;
  const status = blockerCount > 0 ? "Prep needed" : input.routePackets.length ? "Ready" : "Review first";
  const confidence =
    blockerCount > 0
      ? "Review"
      : input.componentOwnership.length > 0 && input.behaviorBindings.length > 0
        ? "High"
        : input.routePackets.length > 0
          ? "Medium"
          : "Review";
  const steps = [
    input.safeChangeCount > 0
      ? {
          title: "Apply parser-safe extractions",
          detail: `${input.safeChangeCount.toLocaleString()} copy-only extraction change(s) are already verified.`,
          facts: [`safeChanges=${input.safeChangeCount.toLocaleString()}`],
        }
      : null,
    blockerCount > 0
      ? {
          title: "Clear preflight blockers",
          detail: "Fix missing references and unresolved imports before asking an AI to rewrite routes.",
          facts: [
            `missingReferences=${input.blockers.length.toLocaleString()}`,
            `unresolvedImports=${input.unresolvedImportCount.toLocaleString()}`,
          ],
        }
      : null,
    primaryRoute
      ? {
          title: `Start with ${primaryRoute.routePath}`,
          detail: `Use routes/${primaryRoute.slug}.json as the first conversion packet.`,
          facts: [
            `source=${primaryRoute.sourceFile}`,
            `owners=${primaryRoute.componentOwners.length.toLocaleString()}`,
            `behaviors=${primaryRoute.behaviorBindings.length.toLocaleString()}`,
            `blockers=${primaryRoute.blockers.length.toLocaleString()}`,
          ],
        }
      : null,
    input.componentOwnership.length > 0
      ? {
          title: "Convert owned components",
          detail: "Use component ownership groups so the AI reads the right HTML, CSS, behavior, and assets together.",
          facts: [`owners=${input.componentOwnership.length.toLocaleString()}`],
        }
      : null,
    input.behaviorBindings.length > 0
      ? {
          title: "Convert behavior bindings last",
          detail: "Turn detected DOM events and mutations into framework state, props, effects, and handlers.",
          facts: [
            `bindings=${input.behaviorBindings.length.toLocaleString()}`,
            `behaviorFiles=${input.behaviorFiles.length.toLocaleString()}`,
          ],
        }
      : null,
  ].filter((step): step is ReactConversionMap["aiHandoff"]["steps"][number] => Boolean(step));

  return {
    status,
    confidence,
    summary: [
      `${input.routePackets.length.toLocaleString()} route packet(s)`,
      `${input.componentOwnership.length.toLocaleString()} component owner group(s)`,
      `${input.behaviorBindings.length.toLocaleString()} behavior binding(s)`,
      primaryRoute ? `start=${primaryRoute.routePath}` : "start=none",
    ].join(" / "),
    primaryRoute: primaryRoute
      ? {
          routePath: primaryRoute.routePath,
          sourceFile: primaryRoute.sourceFile,
          packetSlug: primaryRoute.slug,
          componentOwners: primaryRoute.componentOwners.length,
          behaviorBindings: primaryRoute.behaviorBindings.length,
          blockers: primaryRoute.blockers.length,
        }
      : null,
    steps: steps.slice(0, 5),
    promptFacts: [
      "Use project-map.json as the source of truth.",
      primaryRoute ? `Start with routes/${primaryRoute.slug}.json.` : "Choose one route packet before editing.",
      "Read component locators before scanning whole files.",
      "Preserve class names on the first pass.",
      "Convert one route at a time.",
    ],
  };
}

function bestFirstRoutePacket(
  routePackets: ReactConversionMap["routePackets"],
): ReactConversionMap["routePackets"][number] | null {
  if (!routePackets.length) return null;
  return [...routePackets].sort((a, b) => routePacketHandoffScore(b) - routePacketHandoffScore(a) || a.routePath.localeCompare(b.routePath))[0] ?? null;
}

function routePacketHandoffScore(packet: ReactConversionMap["routePackets"][number]): number {
  return (
    packet.componentOwners.length * 5 +
    packet.behaviorBindings.length * 3 +
    packet.cssSelectors.length +
    packet.assets.length -
    packet.blockers.length * 25
  );
}
