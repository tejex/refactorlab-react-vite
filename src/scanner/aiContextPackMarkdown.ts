import type { ProjectReport, RouteConversionPacket } from "./types";
import type { SourceReferenceRecord } from "./aiContextPackTypes";

export function conversionPlanMarkdown(report: ProjectReport): string {
  const map = report.reactConversionMap;
  const handoff = map?.aiHandoff;
  return ensureTrailingNewline(`# Fixer AI Context Pack

Source: ${report.sourceName}

This pack is a compact parser-backed context layer for converting the project to React, Next.js, or another component framework.

## What to read first

1. context-pack-manifest.json
2. project-map.json
3. routes/index.json
4. The route packet for the page being converted
5. Source snippets and sourceRef ranges only when needed

## Current facts

- ${report.summary}
- ${(map?.routes.length ?? 0).toLocaleString()} route candidate(s)
- ${(map?.routePackets.length ?? 0).toLocaleString()} route packet(s)
- ${(map?.componentOwnership.length ?? 0).toLocaleString()} component ownership group(s)
- ${(map?.behaviorBindings.length ?? 0).toLocaleString()} behavior binding(s)
- ${(map?.blockers.length ?? 0).toLocaleString()} conversion blocker(s)
- ${(report.inlineAssetPlan?.guaranteedSafeChanges.length ?? 0).toLocaleString()} parser-verified rewrite(s)

## Handoff summary

${handoff ? `${handoff.status} (${handoff.confidence}): ${handoff.summary}` : "No AI handoff summary was generated."}

## Conversion order

1. Apply or inspect the verified rewrite output first.
2. Convert one route packet at a time.
3. Use component ownership before broad component guesses.
4. Use behavior bindings to preserve events, state updates, DOM mutations, and API calls.
5. Fix missing references and unresolved imports before asking for a final framework rewrite.
`);
}

export function llmPromptMarkdown(report: ProjectReport): string {
  const map = report.reactConversionMap;
  const primaryRoute = map?.aiHandoff.primaryRoute;
  return ensureTrailingNewline(`# LLM Conversion Prompt

You are converting this project into a maintainable React or Next.js codebase.

Use the attached Fixer AI Context Pack before reading raw project files.

Rules:

1. Treat project-map.json as the source of truth for routes, components, behavior bindings, blockers, and verified parser rewrites.
2. Convert one route packet at a time from routes/index.json.
3. Use sourceReferences and source-snippets to inspect exact file ranges instead of scanning the whole project blindly.
4. Preserve existing behavior before improving architecture.
5. Keep class names and DOM structure stable on the first pass unless the route packet gives enough evidence to safely simplify.
6. Do not invent missing routes, missing assets, or unsupported dependencies.
7. If a source reference is capped or missing, read the original file at the listed sourceRef.

Project:

- Source: ${report.sourceName}
- Summary: ${report.summary}
- Readiness score: ${report.score}
- Primary route: ${primaryRoute ? `${primaryRoute.routePath} from ${primaryRoute.sourceFile}` : "not selected"}

First response should be a short route-by-route migration checklist, then start with the primary route packet.
`);
}

export function routePacketPromptMarkdown(packet: RouteConversionPacket, references: SourceReferenceRecord[]): string {
  return ensureTrailingNewline(`# Convert ${packet.routePath}

Source: ${packet.sourceFile}
Target page component: ${packet.pageComponentName}

Use this packet as the route-level source of truth. Read the listed source references first, then expand only if needed.

## Source References

${references.slice(0, 30).map((reference) => `- ${reference.reason}: ${reference.sourceRef}${reference.snippetPath ? ` (${relativePackPath(reference.snippetPath)})` : ""}`).join("\n") || "- none"}

## Suggested Order

${packet.suggestedOrder.map((step, index) => `${index + 1}. ${step}`).join("\n") || "1. Build the route shell from the source file."}

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

function relativePackPath(path: string): string {
  return path.startsWith("fixer-ai-context-pack/") ? path.slice("fixer-ai-context-pack/".length) : path;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
