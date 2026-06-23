import type { ConversionKitManifest, ConversionTargetProfile } from "./conversionKitTypes";
import { buildConversionRouteQueue } from "./conversionRouteQueue";
import type { ProjectReport } from "./types";

export function readThisFirstMarkdown(manifest: ConversionKitManifest): string {
  return `# Fixer Conversion Kit

Source: ${manifest.source}
Target: ${manifest.targetProfile.framework}

This kit is the LLM-slim handoff package for converting the project route by route. It combines verified parser rewrite facts, route facts, source snippets, migration phases, and one starter scaffold without copying the full rewritten project tree.

## Read order

1. 00-read-this-first.md
2. target-profile.json
3. route-queue.json
4. asset-manifest.json
5. migration-plan/migration-plan.json
6. ai-context-pack/project-map.json
7. route-starter-pack/source/route-packet.json

## Package shape

This kit intentionally omits the full verified-rewrite file tree so it stays small enough for LLM handoff. Use verified-rewrite/rewrite-summary.json for parser rewrite facts. Download fixer-verified-rewrite.zip separately when you need the complete rewritten project output.

## Important boundary

This is not a finished React conversion. It is the structured handoff that makes the final conversion cheaper, less random, and easier to verify.
`;
}

export function llmHandoffMarkdown(report: ProjectReport, target: ConversionTargetProfile): string {
  const capability = report.capabilityMap;
  return `# LLM handoff instructions

You are converting a static web project into ${target.framework}.

Rules:

1. Convert one route at a time using route-queue.json.
2. Start with the queue item marked "start".
3. Convert "ready" routes before "review" routes.
4. Do not convert "blocked" routes until their blockers are fixed.
5. Start from route-starter-pack before opening broad source files.
6. Use verified-rewrite/rewrite-summary.json for parser-verified extraction facts.
7. Use asset-manifest.json to copy omitted static assets into public/ and reference their publicUrl values.
8. Use ai-context-pack/retrieval-manifest.json for exact source ranges.
9. Preserve existing behavior listed in route packets and behavior maps.
10. Preserve existing CSS class names during the first pass.
11. Do not invent missing routes, assets, APIs, or TypeScript support not backed by the facts.
12. After each route, run a build check and fix missing imports before moving on.

Current capability boundary:

${capability?.capabilities.map((item) => `- ${item.label}: ${item.status} (${item.detail})`).join("\n") ?? "- No capability map was generated."}
`;
}

export function targetProfileJson(): ConversionTargetProfile {
  return {
    framework: "Next.js App Router",
    componentSyntax: "TSX scaffold",
    styling: "CSS modules plus existing class names first",
    conversionMode: "route-by-route",
  };
}

export function routeQueue(report: ProjectReport) {
  return buildConversionRouteQueue(report);
}
