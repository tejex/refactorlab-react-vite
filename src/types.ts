export interface Scores {
  aiExpenseScore: number;
  aiReadinessScore: number;
  contextBurden: number;
  verificationDebt: number;
  ambiguityRisk: number;
  blastRadius: number;
  privacyRisk: "Low" | "Medium" | "High";
  retryRisk: "Low" | "Medium" | "High";
  compressionOpportunityPercent: number;
}

export interface Totals {
  totalFiles: number;
  sourceFiles: number;
  ignoredFiles: number;
  estimatedSourceTokens: number;
  filesOver8kTokens: number;
  filesOver32kTokens: number;
}

export interface VerificationSignals {
  hasBuildScript: boolean;
  hasTestScript: boolean;
  hasTypecheckScript: boolean;
  hasLintScript: boolean;
  hasCiConfig: boolean;
  buildScripts: string[];
  testScripts: string[];
  typecheckScripts: string[];
  lintScripts: string[];
}

export interface PrivacySignals {
  envFiles: string[];
  secretCandidateCount: number;
  secretCandidateFiles: string[];
  privateUrlCount: number;
  findings: string[];
}

export interface LanguageStat {
  language: string;
  extension: string;
  files: number;
  estimatedTokens: number;
}

export interface FileSignal {
  path: string;
  language: string;
  estimatedTokens: number;
  lineCount: number;
  sizeBytes: number;
  signals: string[];
}

export interface CostDriver {
  title: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  affectedCount?: number | null;
}

export interface RepoScanReport {
  repoName: string;
  repoPath: string;
  scannedAt: string;
  scores: Scores;
  totals: Totals;
  verification: VerificationSignals;
  privacy: PrivacySignals;
  languages: LanguageStat[];
  expensiveFiles: FileSignal[];
  topCostDrivers: CostDriver[];
  ignoredPaths: string[];
}
