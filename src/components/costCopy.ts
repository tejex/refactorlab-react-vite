import type { CostDriver, Totals } from "../types";

export interface DisplayDriver {
  title: string;
  explanation: string;
  severity: CostDriver["severity"];
  affectedLabel: string | null;
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
        title: "Ambiguous code may waste context",
        explanation: "Dynamic HTML, storage, env, eval, or import patterns make agent reasoning harder.",
        affectedLabel: affected ? `${affected.toLocaleString()} matches` : null,
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

export function tokenCalculation(totalSourceTokens: number, contextWastePercent: number) {
  const estimatedCompactRepoMapTokens = Math.round(totalSourceTokens * (1 - contextWastePercent / 100));
  return {
    estimatedCompactRepoMapTokens,
    potentialTokensSaved: totalSourceTokens - estimatedCompactRepoMapTokens,
  };
}
