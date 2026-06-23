import type { BehaviorBinding, ComponentOwnership, ProjectReport, RouteConversionPacket } from "./types";
import type { SourceReferenceRecord } from "./aiContextPackTypes";

export function compactRoutePacket(packet: RouteConversionPacket, sourceReferences: SourceReferenceRecord[]) {
  return {
    slug: packet.slug,
    routePath: packet.routePath,
    sourceFile: packet.sourceFile,
    pageComponentName: packet.pageComponentName,
    title: packet.title,
    componentOwnerIds: packet.componentOwners.map(componentOwnerId),
    componentOwners: packet.componentOwners.map(componentOwnerRouteSummary),
    behaviorBindings: packet.behaviorBindings.map(behaviorBindingSummary),
    cssSelectors: packet.cssSelectors.slice(0, 80),
    cssSelectorCount: packet.cssSelectors.length,
    assets: packet.assets,
    blockers: packet.blockers,
    suggestedOrder: packet.suggestedOrder,
    sourceReferences,
    factFiles: {
      componentOwnership: "facts/component-ownership.json",
      behaviorBindings: "facts/behavior-bindings.json",
      projectIntegrity: "facts/project-integrity.json",
    },
  };
}

export function packetIndexEntry(packet: RouteConversionPacket) {
  return {
    slug: packet.slug,
    routePath: packet.routePath,
    sourceFile: packet.sourceFile,
    pageComponentName: packet.pageComponentName,
    componentOwners: packet.componentOwners.length,
    behaviorBindings: packet.behaviorBindings.length,
    blockers: packet.blockers.length,
    packetPath: `routes/${packet.slug}.json`,
    promptPath: `routes/${packet.slug}-prompt.md`,
  };
}

export function componentOwnerIndex(owner: ComponentOwnership) {
  return {
    id: componentOwnerId(owner),
    componentName: owner.componentName,
    selector: owner.selector,
    confidence: owner.confidence,
    routesUsedIn: owner.routesUsedIn,
    sourceFiles: owner.sourceFiles,
    cssSelectorCount: owner.cssSelectors.length,
    behaviorBindingCount: owner.behaviorBindings.length,
    assetCount: owner.assets.length,
    locatorCount: owner.locators.length,
  };
}

export function componentOwnerFact(owner: ComponentOwnership) {
  return { id: componentOwnerId(owner), ...owner };
}

export function behaviorBindingFact(binding: BehaviorBinding) {
  return { id: behaviorBindingId(binding), ...binding };
}

export function summarizeBehaviorBindings(bindings: BehaviorBinding[]) {
  const byFile = new Map<string, { sourceFile: string; count: number; endpoints: Set<string>; effects: Set<string> }>();
  for (const binding of bindings) {
    const row = byFile.get(binding.sourceFile) ?? {
      sourceFile: binding.sourceFile,
      count: 0,
      endpoints: new Set<string>(),
      effects: new Set<string>(),
    };
    row.count += 1;
    binding.endpoints.forEach((endpoint) => row.endpoints.add(endpoint));
    binding.effects.forEach((effect) => row.effects.add(effect));
    byFile.set(binding.sourceFile, row);
  }
  return [...byFile.values()].map((row) => ({
    sourceFile: row.sourceFile,
    count: row.count,
    endpoints: [...row.endpoints].slice(0, 8),
    effects: [...row.effects].slice(0, 8),
  }));
}

export function compactJsTsModuleMap(map: NonNullable<ProjectReport["jsTsModuleMap"]>) {
  return {
    totalImports: map.totalImports,
    totalExports: map.totalExports,
    files: map.files.map((file) => ({
      path: file.path,
      imports: file.imports,
      exports: file.exports,
      sideEffects: file.sideEffects,
      behaviorBindings: file.behaviorBindings.length,
      resolvedImports: file.resolvedImports.length,
      unresolvedImports: file.unresolvedImports,
    })),
    resolvedImports: map.resolvedImports,
    unresolvedImports: map.unresolvedImports,
  };
}

export function safeChangeFact(change: NonNullable<ProjectReport["inlineAssetPlan"]>["guaranteedSafeChanges"][number]) {
  return {
    sourceFile: change.file,
    targetPath: change.targetPath,
    kind: change.kind,
    lineStart: change.lineStart,
    lineEnd: change.lineEnd,
    sourceLines: change.sourceLines,
    action: change.action,
  };
}

function componentOwnerRouteSummary(owner: ComponentOwnership) {
  const firstLocator = owner.locators[0];
  return {
    ...componentOwnerIndex(owner),
    firstLocator: firstLocator
      ? {
          sourceFile: firstLocator.sourceFile,
          lineStart: firstLocator.lineStart,
          lineEnd: firstLocator.lineEnd,
          childSummary: firstLocator.childSummary,
        }
      : null,
  };
}

function behaviorBindingSummary(binding: BehaviorBinding) {
  return {
    id: behaviorBindingId(binding),
    sourceFile: binding.sourceFile,
    selector: binding.selector,
    kind: binding.kind,
    event: binding.event,
    handler: binding.handler,
    effects: binding.effects,
    targets: binding.targets.slice(0, 4),
    endpoints: binding.endpoints,
    line: binding.line,
    confidence: binding.confidence,
    componentName: binding.componentName,
    componentSelector: binding.componentSelector,
  };
}

function componentOwnerId(owner: ComponentOwnership): string {
  return stableId(`${owner.componentName}:${owner.selector}`);
}

function behaviorBindingId(binding: BehaviorBinding): string {
  return stableId(`${binding.sourceFile}:${binding.selector}:${binding.event}:${binding.handler}:${binding.line}`);
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
