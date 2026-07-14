import type { CostDriver, RepoScanReport, Totals } from "../types";

export interface DisplayDriver {
  title: string;
  explanation: string;
  severity: CostDriver["severity"];
  affectedLabel: string | null;
}

export interface TokenContextMath {
  aiEligibleRepositoryTokens: number;
  repositoryPacketTokens: number;
  potentiallyAvoidableContextTokens: number;
  potentialInputTokenReductionPercent: number;
}

export function costFocusedDriver(driver: CostDriver, totals: Totals): DisplayDriver {
  const affected = driver.affectedCount ?? 0;
  const defaults = {
    severity: driver.severity,
    affectedLabel: affected ? `${affected.toLocaleString()} signals` : null,
  };

  switch (driver.title) {
    case "Source context is heavy":
      return {
        ...defaults,
        title: "Large repo context may burn tokens",
        explanation: `${compactNumber(totals.estimatedSourceTokens)} estimated source tokens. Broad AI exploration may be expensive.`,
        affectedLabel: affected ? `${affected.toLocaleString()} files` : null,
      };
    case "Verification path is incomplete":
      return {
        ...defaults,
        title: "Missing checks increase retry cost",
        explanation: "Missing test or CI signals. Failed AI patches may require more attempts.",
        affectedLabel: affected ? `${affected.toLocaleString()} missing signals` : null,
      };
    case "Runtime ambiguity patterns found":
      return {
        ...defaults,
        title: "Ambiguous code may expand context",
        explanation: "Dynamic HTML, storage, env, eval, or import patterns make agent reasoning harder.",
        affectedLabel: affected ? `${affected.toLocaleString()} matches` : null,
      };
    case "Generated or dependency context can inflate scans":
      return {
        ...defaults,
        title: "Generated context may inflate scans",
        explanation: "Generated/reference files and dependency lock files are summarized separately from AI-eligible repository context.",
        affectedLabel: affected ? `${affected.toLocaleString()} files` : null,
      };
    case "Import graph may amplify AI changes":
      return {
        ...defaults,
        title: "Import graph can widen AI edits",
        explanation: "Shared imports, unresolved imports, or circular files can make context selection harder.",
        affectedLabel: affected ? `${affected.toLocaleString()} graph signals` : null,
      };
    case "Changes may have wide blast radius":
      return {
        ...defaults,
        title: "Wide blast radius can multiply edits",
        explanation: "Shared or oversized files make isolated AI changes harder.",
        affectedLabel: affected ? `${affected.toLocaleString()} signals` : null,
      };
    case "Privacy-sensitive signals detected":
      return {
        ...defaults,
        title: "Sensitive context may be risky to upload",
        explanation: ".env files, secret-like strings, or internal URLs were detected.",
        affectedLabel: affected ? `${affected.toLocaleString()} signals` : null,
      };
    default:
      return {
        ...defaults,
        title: driver.title,
        explanation: driver.explanation,
      };
  }
}

export function compactNumber(value: number) {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function tokenContextMath(sourceTokens: number, contextReductionPercent: number): TokenContextMath {
  const safePercent = clampPercent(contextReductionPercent);
  const potentiallyAvoidableContextTokens = Math.round(sourceTokens * (safePercent / 100));
  const repositoryPacketTokens = Math.max(0, sourceTokens - potentiallyAvoidableContextTokens);

  return {
    aiEligibleRepositoryTokens: sourceTokens,
    repositoryPacketTokens,
    potentiallyAvoidableContextTokens,
    potentialInputTokenReductionPercent: safePercent,
  };
}

export function tokenContextMathFromReport(report: RepoScanReport): TokenContextMath {
  const accounting = report.tokenAccounting;

  if (accounting) {
    return {
      aiEligibleRepositoryTokens: accounting.aiEligibleRepositoryTokens,
      repositoryPacketTokens: accounting.repositoryPacketTokens,
      potentiallyAvoidableContextTokens: accounting.potentiallyAvoidableContextTokens,
      potentialInputTokenReductionPercent: clampPercent(
        accounting.potentialInputTokenReductionPercent,
      ),
    };
  }

  return tokenContextMath(
    report.totals.estimatedSourceTokens,
    report.scores.compressionOpportunityPercent,
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
