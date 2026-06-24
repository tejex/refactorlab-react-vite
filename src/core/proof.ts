export type ProofLevel = "proven" | "supported" | "heuristic" | "unresolved";

export interface Evidence {
  source: string;
  detail: string;
  path?: string;
  value?: string;
}

export interface Proof {
  level: ProofLevel;
  basis: Evidence[];
  assumptions: string[];
  limitations: string[];
}

export function proof(level: ProofLevel, basis: Evidence[], limitations: string[] = [], assumptions: string[] = []): Proof {
  return {
    level,
    basis: [...basis].sort(compareEvidence),
    assumptions: [...assumptions].sort(),
    limitations: [...limitations].sort(),
  };
}

function compareEvidence(a: Evidence, b: Evidence): number {
  return (
    a.source.localeCompare(b.source) ||
    (a.path ?? "").localeCompare(b.path ?? "") ||
    a.detail.localeCompare(b.detail) ||
    (a.value ?? "").localeCompare(b.value ?? "")
  );
}

