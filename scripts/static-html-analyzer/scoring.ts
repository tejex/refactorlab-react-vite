import { sideEffectPatterns } from "./config.ts";
import type { FileAnalysis, ScoreOptions, SideEffectKind } from "./types.ts";
import { countMatches } from "./text-utils.ts";

export function scoreFile(file: FileAnalysis, options: ScoreOptions): number {
  const sideEffectScore = Object.values(file.sideEffects).reduce((sum, count) => sum + count, 0) * 2.2;
  const complexityScore = file.complexity.branches * 1.6 + file.complexity.nestingEstimate * 3 + file.complexity.fanOut * 1.8;
  const sizeScore = file.lines * 0.09 * options.sizeWeight;
  return Math.round(sizeScore + sideEffectScore + complexityScore + options.extra);
}

export function countSideEffects(content: string): Record<SideEffectKind, number> {
  return Object.fromEntries(sideEffectPatterns.map(([name, pattern]) => [name, countMatches(content, pattern)])) as Record<
    SideEffectKind,
    number
  >;
}
