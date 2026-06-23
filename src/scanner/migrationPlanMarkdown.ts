import type { ProjectReport } from "./types";
import type { MigrationPlanPhase, MigrationPlanStats } from "./migrationPlanTypes";

export function overviewMarkdown(report: ProjectReport, stats: MigrationPlanStats, phases: MigrationPlanPhase[]): string {
  return ensureTrailingNewline(`# Fixer Migration Plan

Source: ${report.sourceName}
Readiness score: ${report.score}/100

${report.summary}

## What this is

This is a parser-backed migration plan for moving the project toward React, Next.js, or another component framework. It does not guess. It orders the facts Fixer already found so an AI converter can work route by route instead of scanning blindly.

## Current shape

- ${stats.routes.toLocaleString()} route candidate(s)
- ${stats.routePackets.toLocaleString()} route packet(s)
- ${stats.componentOwners.toLocaleString()} component ownership group(s)
- ${stats.behaviorBindings.toLocaleString()} behavior binding(s)
- ${stats.verifiedRewrites.toLocaleString()} verified rewrite(s)
- ${stats.blockers.toLocaleString()} blocker(s)

## Phase order

${phases.map((phase, index) => `${index + 1}. ${phase.title} - ${phase.status}`).join("\n")}

## Use this with an AI

1. Read migration-plan.json first.
2. Clear blocked phases before asking for a final app rewrite.
3. Convert one route packet at a time.
4. Use component ownership and behavior bindings as source-of-truth facts.
5. Preserve behavior first, then improve architecture.
`);
}

export function invariantsMarkdown(report: ProjectReport): string {
  return ensureTrailingNewline(`# Migration Invariants

Source: ${report.sourceName}

These rules should hold while converting the project:

1. Preserve routes and public URLs unless the user approves a routing change.
2. Preserve visible behavior before renaming, redesigning, or simplifying.
3. Keep IDs, classes, data attributes, and selectors stable on the first pass when behavior depends on them.
4. Apply verified rewrite output before broad framework conversion when the rewrite manifest passes.
5. Resolve missing assets, pages, styles, scripts, and imports before treating the conversion as complete.
6. Convert route by route, then extract shared components after at least two routes prove the same ownership pattern.
7. Do not invent missing files, APIs, or dependencies. Mark them as blockers.
`);
}

export function currentProjectMapMarkdown(report: ProjectReport, stats: MigrationPlanStats): string {
  const map = report.reactConversionMap;
  return ensureTrailingNewline(`# Current Project Map

## Project

- Source: ${report.sourceName}
- Summary: ${report.summary}
- Score: ${report.score}/100

## Parser facts

- Verified rewrites: ${stats.verifiedRewrites.toLocaleString()}
- Route packets: ${stats.routePackets.toLocaleString()}
- Component owners: ${stats.componentOwners.toLocaleString()}
- Behavior bindings: ${stats.behaviorBindings.toLocaleString()}
- Dead files: ${stats.deadFiles.toLocaleString()}
- Duplicate CSS selectors: ${stats.duplicateSelectors.toLocaleString()}
- Blockers: ${stats.blockers.toLocaleString()}

## Primary handoff

${map?.aiHandoff ? `${map.aiHandoff.status} (${map.aiHandoff.confidence}): ${map.aiHandoff.summary}` : "No AI handoff summary was generated."}

## Route packets

${map?.routePackets.map((packet) => `- ${packet.routePath}: ${packet.sourceFile}; owners ${packet.componentOwners.length}; behavior ${packet.behaviorBindings.length}; blockers ${packet.blockers.length}`).join("\n") || "- none"}
`);
}

export function phaseMarkdown(phase: MigrationPlanPhase): string {
  return ensureTrailingNewline(`# ${phase.title}

Status: ${phase.status}

${phase.summary}

## Facts

${phase.facts.map((fact) => `- ${fact}`).join("\n") || "- none"}

## Files

${phase.files.slice(0, 80).map((file) => `- ${file}`).join("\n") || "- none"}

## Blockers

${phaseBlockersMarkdown(phase)}
`);
}

export function testGatesMarkdown(report: ProjectReport, phases: MigrationPlanPhase[]): string {
  const blocked = phases.filter((phase) => phase.status === "blocked");
  return ensureTrailingNewline(`# Test Gates

Source: ${report.sourceName}

Use these gates before calling the migration done:

1. The verified rewrite manifest has no unexpected rejected changes.
2. All blocked phases are cleared or explicitly accepted by the user.
3. Each converted route renders without missing local assets.
4. Behavior bindings from the source route are present in the converted route.
5. Build and typecheck pass in the target app.
6. The first-pass UI preserves the source layout before cleanup.

Blocked phases now:

${blocked.map((phase) => `- ${phase.title}: ${phase.blockers.length} blocker(s)`).join("\n") || "- none"}
`);
}

export function aiInstructionsMarkdown(report: ProjectReport, phases: MigrationPlanPhase[]): string {
  const firstBlocked = phases.find((phase) => phase.status === "blocked");
  return ensureTrailingNewline(`# AI Instructions

You are helping convert this project into a maintainable React or Next.js app.

Source: ${report.sourceName}

Rules:

1. Read migration-plan.json before touching raw files.
2. Follow the phases in order.
3. If a phase is blocked, explain the blocker and stop that phase instead of inventing files.
4. Use route packets, component ownership, and behavior bindings as parser facts.
5. Convert one route at a time.
6. Preserve existing behavior before improving structure.

First task:

${firstBlocked ? `Clear or explain "${firstBlocked.title}" before conversion.` : "Start with the first route packet and produce a route-level migration checklist."}
`);
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function phaseBlockersMarkdown(phase: MigrationPlanPhase): string {
  if (phase.blockerGroups?.length) {
    return phase.blockerGroups.map((group) => `- ${group.summary}: ${group.sourceFiles.join(", ")}`).join("\n");
  }
  return phase.blockers.slice(0, 80).map((blocker) => `- ${blocker}`).join("\n") || "- none";
}
