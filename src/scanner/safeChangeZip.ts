import type { GuaranteedSafeChange, ProjectReport } from "./types";

interface ZipFileInput {
  path: string;
  content: string;
}

const textEncoder = new TextEncoder();
const crcTable = buildCrcTable();

export function downloadGuaranteedSafeChanges(changes: GuaranteedSafeChange[], sourceName: string) {
  const files = buildProposedFiles(changes, sourceName);
  downloadZip(files, "fixer-proposed.zip");
}

export function downloadReactHandoffPack(report: ProjectReport) {
  downloadZip(buildReactHandoffFiles(report), "fixer-react-handoff.zip");
}

function downloadZip(files: ZipFileInput[], filename: string) {
  const zipBytes = createStoredZip(files);
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildProposedFiles(changes: GuaranteedSafeChange[], sourceName: string): ZipFileInput[] {
  const copiedFiles = changes.map((change) => ({
    path: `fixer-proposed/${normalizeZipPath(change.targetPath)}`,
    content: ensureTrailingNewline(change.content),
  }));
  const manifest = {
    source: sourceName,
    generatedAt: new Date().toISOString(),
    originalUnchanged: true,
    changes: changes.map((change) => ({
      from: change.file,
      lines: change.lineStart === change.lineEnd ? `${change.lineStart}` : `${change.lineStart}-${change.lineEnd}`,
      to: `fixer-proposed/${normalizeZipPath(change.targetPath)}`,
      kind: change.kind,
      action: change.action,
    })),
  };

  return [
    ...copiedFiles,
    {
      path: "fixer-proposed/manifest.json",
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ];
}

function buildReactHandoffFiles(report: ProjectReport): ZipFileInput[] {
  const root = "fixer-react-handoff";
  const conversionMap = report.reactConversionMap;
  const handoff = {
    source: report.sourceName,
    generatedAt: new Date().toISOString(),
    purpose: "Parser-backed React conversion handoff for an AI or developer.",
    summary: report.summary,
    readinessScore: report.score,
    routes: conversionMap?.routes ?? [],
    routePackets: conversionMap?.routePackets ?? [],
    aiHandoff: conversionMap?.aiHandoff ?? null,
    componentCandidates: conversionMap?.componentCandidates ?? [],
    componentOwnership: conversionMap?.componentOwnership ?? [],
    behaviorFiles: conversionMap?.behaviorFiles ?? [],
    behaviorBindings: conversionMap?.behaviorBindings ?? [],
    conversionBlockers: conversionMap?.blockers ?? [],
    verifiedSafeChanges: report.inlineAssetPlan?.guaranteedSafeChanges.map((change) => ({
      sourceFile: change.file,
      targetPath: change.targetPath,
      kind: change.kind,
      sourceLines: change.sourceLines,
      action: change.action,
    })) ?? [],
    missingReferences: report.integrityMap?.missingReferences ?? [],
    jsTsModuleMap: report.jsTsModuleMap
      ? {
          files: report.jsTsModuleMap.files,
          behaviorBindings: report.jsTsModuleMap.behaviorBindings,
          resolvedImports: report.jsTsModuleMap.resolvedImports,
          unresolvedImports: report.jsTsModuleMap.unresolvedImports,
        }
      : null,
    deadCodeCandidates: report.deadCodeMap?.unreachableFiles ?? [],
  };

  return [
    {
      path: `${root}/project-map.json`,
      content: `${JSON.stringify(handoff, null, 2)}\n`,
    },
    {
      path: `${root}/conversion-plan.md`,
      content: reactConversionPlanMarkdown(report),
    },
    {
      path: `${root}/ai-brief.md`,
      content: aiHandoffBriefMarkdown(report),
    },
    {
      path: `${root}/codex-prompt.md`,
      content: aiConversionPromptMarkdown(report, "Codex"),
    },
    {
      path: `${root}/cursor-prompt.md`,
      content: aiConversionPromptMarkdown(report, "Cursor"),
    },
    {
      path: `${root}/verified-changes.json`,
      content: `${JSON.stringify(report.inlineAssetPlan?.guaranteedSafeChanges ?? [], null, 2)}\n`,
    },
    ...routePacketFiles(root, report),
  ];
}

function reactConversionPlanMarkdown(report: ProjectReport): string {
  const map = report.reactConversionMap;
  const safeChanges = report.inlineAssetPlan?.guaranteedSafeChanges.length ?? 0;
  const routes = map?.routes ?? [];
  const routePackets = map?.routePackets ?? [];
  const highComponents = (map?.componentCandidates ?? []).filter((candidate) => candidate.confidence === "High");
  const componentOwners = map?.componentOwnership ?? [];
  const behaviorBindings = map?.behaviorBindings ?? [];
  const blockers = map?.blockers ?? [];
  const aiHandoff = map?.aiHandoff;

  return ensureTrailingNewline(`# React Conversion Plan

Source: ${report.sourceName}

## Current State

- ${report.summary}
- ${routes.length.toLocaleString()} route candidate(s)
- ${routePackets.length.toLocaleString()} route packet(s)
- ${(map?.componentCandidates.length ?? 0).toLocaleString()} component candidate(s)
- ${componentOwners.length.toLocaleString()} component ownership group(s)
- ${behaviorBindings.length.toLocaleString()} behavior binding(s)
- ${(map?.behaviorFiles.length ?? 0).toLocaleString()} behavior file(s)
- ${blockers.length.toLocaleString()} conversion blocker(s)
- ${safeChanges.toLocaleString()} parser-verified safe extraction change(s)
- AI handoff: ${aiHandoff ? `${aiHandoff.status} (${aiHandoff.confidence})` : "not generated"}

## Suggested Order

1. Apply or review parser-verified safe extraction changes.
2. Fix conversion blockers before asking an AI to generate React code.
3. Convert routes one page at a time.
4. Start with component ownership groups because they already include routes, CSS, behavior, and assets.
5. Use behavior bindings to convert events into React props/state/effects.
6. Convert behavior files after the static route shell is working.

## AI Handoff Brief

${aiHandoff?.summary ?? "No AI handoff brief was generated."}

${aiHandoff?.steps.map((step, index) => `${index + 1}. ${step.title}: ${step.detail}`).join("\n") ?? ""}

## Route Candidates

${routes.map((route) => `- ${route.routePath}: ${route.sourceFile} -> ${route.componentName}`).join("\n") || "- none"}

## Route Packets

${routePackets.map((packet) => `- ${packet.routePath}: routes/${packet.slug}.json; owners=${packet.componentOwners.length}; behavior=${packet.behaviorBindings.length}; blockers=${packet.blockers.length}`).join("\n") || "- none"}

## High-Confidence Component Candidates

${highComponents.map((candidate) => `- ${candidate.name}: ${candidate.sourceFile} (${candidate.signals.join(", ")})`).join("\n") || "- none"}

## Component Ownership Groups

${componentOwners.slice(0, 30).map((owner) => `- ${owner.componentName}: ${owner.selector}; ${owner.locators[0] ? `${owner.locators[0].sourceFile}:${owner.locators[0].lineStart}-${owner.locators[0].lineEnd}; ` : ""}routes=${owner.routesUsedIn.join(", ") || "none"}; css=${owner.cssSelectors.length}; behavior=${owner.behaviorBindings.length}; assets=${owner.assets.length}`).join("\n") || "- none"}

## Behavior Bindings

${behaviorBindings.slice(0, 30).map((binding) => `- ${binding.selector}: ${binding.event} in ${binding.sourceFile}:${binding.line}${binding.componentName ? ` -> ${binding.componentName}` : ""} (${binding.effects.join(", ") || "event binding"}${binding.endpoints.length ? `; ${binding.endpoints.join(", ")}` : ""})`).join("\n") || "- none"}

## Conversion Blockers

${blockers.map((blocker) => `- ${blocker.missingPath}: ${blocker.kind} referenced by ${blocker.sourceFile}`).join("\n") || "- none"}
`);
}

function aiHandoffBriefMarkdown(report: ProjectReport): string {
  const aiHandoff = report.reactConversionMap?.aiHandoff;
  if (!aiHandoff) {
    return ensureTrailingNewline(`# AI Handoff Brief

No AI handoff brief was generated.
`);
  }

  return ensureTrailingNewline(`# AI Handoff Brief

Source: ${report.sourceName}
Status: ${aiHandoff.status}
Confidence: ${aiHandoff.confidence}

${aiHandoff.summary}

## Start Here

${aiHandoff.primaryRoute ? `- Route: ${aiHandoff.primaryRoute.routePath}
- Source: ${aiHandoff.primaryRoute.sourceFile}
- Packet: routes/${aiHandoff.primaryRoute.packetSlug}.json
- Owners: ${aiHandoff.primaryRoute.componentOwners}
- Behaviors: ${aiHandoff.primaryRoute.behaviorBindings}
- Blockers: ${aiHandoff.primaryRoute.blockers}` : "- No route packet selected."}

## Steps

${aiHandoff.steps.map((step, index) => `${index + 1}. ${step.title}
   ${step.detail}
   ${step.facts.join("; ")}`).join("\n\n") || "- none"}

## Prompt Facts

${aiHandoff.promptFacts.map((fact) => `- ${fact}`).join("\n")}
`);
}

function aiConversionPromptMarkdown(report: ProjectReport, toolName: string): string {
  const routes = report.reactConversionMap?.routes ?? [];
  const routePackets = report.reactConversionMap?.routePackets ?? [];
  const componentOwners = report.reactConversionMap?.componentOwnership ?? [];
  const behaviorBindings = report.reactConversionMap?.behaviorBindings ?? [];
  const aiHandoff = report.reactConversionMap?.aiHandoff;

  return ensureTrailingNewline(`# ${toolName} React Conversion Prompt

You are converting a static HTML/CSS/JS project into a maintainable React project.

Use the attached project-map.json as the source of truth before reading raw files. Do not invent routes, components, or dependencies that are not supported by the map.

Goals:

1. Preserve the existing visual behavior first.
2. Convert one route at a time.
3. Prefer componentOwnership groups over raw component candidates because ownership groups include CSS, behavior, assets, and route usage.
4. Use behaviorBindings to convert DOM events into React event props, state, effects, and handlers.
5. Keep CSS class names initially unless there is a clear reason to change them.
6. Treat conversion blockers and unresolved imports as preflight issues.

AI handoff:

${aiHandoff ? `- Status: ${aiHandoff.status}
- Confidence: ${aiHandoff.confidence}
- ${aiHandoff.summary}
${aiHandoff.promptFacts.map((fact) => `- ${fact}`).join("\n")}` : "- No AI handoff brief was generated."}

Start with these route candidates:

${routes.slice(0, 20).map((route) => `- ${route.routePath}: ${route.sourceFile} -> ${route.componentName}`).join("\n") || "- none"}

Use route packets first:

${routePackets.slice(0, 20).map((packet) => `- ${packet.routePath}: read routes/${packet.slug}.json and routes/${packet.slug}-prompt.md`).join("\n") || "- none"}

Top component ownership groups:

${componentOwners.slice(0, 15).map((owner) => `- ${owner.componentName}: ${owner.selector}; ${owner.locators[0] ? `read ${owner.locators[0].sourceFile}:${owner.locators[0].lineStart}-${owner.locators[0].lineEnd}; ` : ""}CSS ${owner.cssSelectors.length}; behavior ${owner.behaviorBindings.length}; assets ${owner.assets.length}`).join("\n") || "- none"}

Key behavior bindings:

${behaviorBindings.slice(0, 20).map((binding) => `- ${binding.selector}: ${binding.event} -> ${binding.effects.join(", ") || "event binding"}${binding.componentName ? `; component ${binding.componentName}` : ""}${binding.endpoints.length ? `; endpoint ${binding.endpoints.join(", ")}` : ""} (${binding.sourceFile}:${binding.line})`).join("\n") || "- none"}

Before editing code, produce a short migration checklist from project-map.json.
`);
}

function routePacketFiles(root: string, report: ProjectReport): ZipFileInput[] {
  const packets = report.reactConversionMap?.routePackets ?? [];
  if (!packets.length) return [];

  return [
    {
      path: `${root}/routes/index.md`,
      content: ensureTrailingNewline(`# Route Packets

${packets.map((packet) => `- ${packet.routePath}: ${packet.sourceFile} -> ${packet.pageComponentName} (${packet.componentOwners.length} owners, ${packet.behaviorBindings.length} behaviors)`).join("\n")}
`),
    },
    ...packets.flatMap((packet) => [
      {
        path: `${root}/routes/${packet.slug}.json`,
        content: `${JSON.stringify(packet, null, 2)}\n`,
      },
      {
        path: `${root}/routes/${packet.slug}-prompt.md`,
        content: routePacketPromptMarkdown(packet),
      },
    ]),
  ];
}

function routePacketPromptMarkdown(packet: NonNullable<ProjectReport["reactConversionMap"]>["routePackets"][number]): string {
  return ensureTrailingNewline(`# Convert ${packet.routePath}

Source: ${packet.sourceFile}
Target page component: ${packet.pageComponentName}

Use this packet as the route-level source of truth. Read only the listed source file/line ranges first, then expand only if needed.

## Suggested Order

${packet.suggestedOrder.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## Component Owners

${packet.componentOwners.map((owner) => {
  const locator = owner.locators[0];
  return `- ${owner.componentName}: ${owner.selector}${locator ? ` (${locator.sourceFile}:${locator.lineStart}-${locator.lineEnd})` : ""}; CSS ${owner.cssSelectors.length}; behavior ${owner.behaviorBindings.length}; assets ${owner.assets.length}`;
}).join("\n") || "- none"}

## Behavior Bindings

${packet.behaviorBindings.slice(0, 30).map((binding) => `- ${binding.selector}: ${binding.event} -> ${binding.effects.join(", ") || "event binding"}${binding.endpoints.length ? `; ${binding.endpoints.join(", ")}` : ""} (${binding.sourceFile}:${binding.line})`).join("\n") || "- none"}

## Blockers

${packet.blockers.map((blocker) => `- ${blocker.missingPath}: ${blocker.kind} referenced by ${blocker.sourceFile}`).join("\n") || "- none"}
`);
}

function createStoredZip(files: ZipFileInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const pathBytes = textEncoder.encode(file.path);
    const contentBytes = textEncoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = createLocalHeader(pathBytes, contentBytes, crc);
    const centralHeader = createCentralHeader(pathBytes, contentBytes, crc, offset);

    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + contentBytes.byteLength;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const endRecord = createEndRecord(files.length, centralSize, centralOffset);
  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

function createLocalHeader(pathBytes: Uint8Array, contentBytes: Uint8Array, crc: number): Uint8Array {
  const header = new Uint8Array(30 + pathBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, contentBytes.byteLength, true);
  view.setUint32(22, contentBytes.byteLength, true);
  view.setUint16(26, pathBytes.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(pathBytes, 30);
  return header;
}

function createCentralHeader(pathBytes: Uint8Array, contentBytes: Uint8Array, crc: number, localOffset: number): Uint8Array {
  const header = new Uint8Array(46 + pathBytes.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, contentBytes.byteLength, true);
  view.setUint32(24, contentBytes.byteLength, true);
  view.setUint16(28, pathBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  header.set(pathBytes, 46);
  return header;
}

function createEndRecord(fileCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

function normalizeZipPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\.\.+/g, ".");
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
