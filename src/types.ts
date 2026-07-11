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

export interface RepoGraphSummary {
  totalImports: number;
  relativeImports: number;
  externalImports: number;
  resolvedImports: number;
  unresolvedImports: number;
  circularImportFiles: number;
  maxFanIn: number;
  maxFanOut: number;
  sensitiveModuleRefs: number;
  hubFiles: GraphFileSignal[];
}

export interface GraphFileSignal {
  path: string;
  fanIn: number;
  fanOut: number;
  signals: string[];
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

export interface ContextClassification {
  version: string;
  totals: ClassificationTotals;
  summaries: ContextSummary[];
  files: ClassifiedFile[];
}

export interface ClassificationTotals {
  totalReadableTokens: number;
  defaultAiContextTokens: number;
  defaultAiContextFiles: number;
  authoredSourceTokens: number;
  authoredSourceFiles: number;
  sourceOfTruthConfigTokens: number;
  sourceOfTruthConfigFiles: number;
  generatedReferenceTokens: number;
  generatedReferenceFiles: number;
  dependencyLockfileTokens: number;
  dependencyLockfileFiles: number;
  buildOutputTokens: number;
  buildOutputFiles: number;
  vendoredDependencyTokens: number;
  vendoredDependencyFiles: number;
  runtimeDataTokens: number;
  runtimeDataFiles: number;
  unknownSourceTokens: number;
  unknownSourceFiles: number;
}

export interface ClassifiedFile {
  path: string;
  language: string;
  estimatedTokens: number;
  lineCount: number;
  sizeBytes: number;
  classification: FileClassification;
}

export interface FileClassification {
  role: string;
  contextPolicy: string;
  confidence: number;
  reasons: string[];
}

export interface ContextSummary {
  id: string;
  title: string;
  role: string;
  contextPolicy: string;
  totalTokens: number;
  fileCount: number;
  sourcePaths: string[];
  topFiles: ContextSummaryFile[];
  details: string[];
}

export interface ContextSummaryFile {
  path: string;
  estimatedTokens: number;
  reason: string;
}

export interface TokenizationMetadata {
  method: string;
  encoding?: string | null;
  fallbackUsed: boolean;
  notes: string[];
}

export interface RepoDigestSection {
  id: string;
  title: string;
  content: string;
  estimatedTokens: number;
  budgetTokens: number;
}

export interface RepoDigest {
  generatedAt: string;
  estimatedTokens: number;
  sections: RepoDigestSection[];
  notes: string[];
}

export interface ContextEstimate {
  broadSourceTokens: number;
  digestTokens: number;
  potentiallyAvoidableTokens: number;
  potentiallyAvoidablePercent: number;
  basis: string;
  notes: string[];
}

export interface RepoScanReport {
  repoName: string;
  repoPath: string;
  scannedAt: string;
  scores: Scores;
  totals: Totals;
  verification: VerificationSignals;
  privacy: PrivacySignals;
  repoGraph: RepoGraphSummary;
  languages: LanguageStat[];
  expensiveFiles: FileSignal[];
  topCostDrivers: CostDriver[];
  ignoredPaths: string[];
  contextClassification?: ContextClassification;
  tokenization?: TokenizationMetadata;
  repoDigest?: RepoDigest | null;
  contextEstimate?: ContextEstimate | null;
}
