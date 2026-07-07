export interface ScoreDimension {
  value: number;
  max: number;
  level: "low" | "medium" | "high" | "ready";
  reasons: string[];
}

export interface LanguageStat {
  language: string;
  extension: string;
  files: number;
  lines: number;
  bytes: number;
  tokenEstimate: number;
}

export interface FileFinding {
  path: string;
  language: string;
  extension: string;
  lineCount: number;
  sizeBytes: number;
  tokenEstimate: number;
  flags: string[];
  reasons: string[];
}

export interface CostDriver {
  id: string;
  title: string;
  impact: "low" | "medium" | "high";
  reason: string;
  evidence: string[];
}

export interface DetectedScripts {
  build: string[];
  test: string[];
  typecheck: string[];
  other: string[];
}

export interface RepoTotals {
  files: number;
  analyzedFiles: number;
  ignoredFiles: number;
  lines: number;
  bytes: number;
  tokenEstimate: number;
}

export interface TokenHeavyDirectory {
  path: string;
  tokenEstimate: number;
  files: number;
}

export interface GeneratedVendorNoise {
  path: string;
  reason: string;
}

export interface RepoScanReport {
  sourcePath: string;
  sourceType: string;
  scannedAt: string;
  aiExpenseScore: ScoreDimension;
  aiReadinessScore: ScoreDimension;
  contextBurden: ScoreDimension;
  verificationDebt: ScoreDimension;
  ambiguityRisk: ScoreDimension;
  blastRadius: ScoreDimension;
  privacyRisk: ScoreDimension;
  topCostDrivers: CostDriver[];
  files: FileFinding[];
  languages: LanguageStat[];
  totals: RepoTotals;
  largeFiles: FileFinding[];
  tokenHeavyDirectories: TokenHeavyDirectory[];
  generatedVendorNoise: GeneratedVendorNoise[];
  scripts: DetectedScripts;
  privacyFindings: string[];
  notes: string[];
}
