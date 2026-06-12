export type SourceExtension = ".html" | ".js" | ".css" | ".ts";

export type SideEffectKind =
  | "network"
  | "storage"
  | "dom"
  | "timer"
  | "env"
  | "logging"
  | "navigation"
  | "worker-platform";

export interface ComplexityMetrics {
  branches: number;
  nestingEstimate: number;
  fanOut: number;
}

export interface TreeSummary {
  parser: "parse5" | "postcss" | "babel";
  nodes: number;
  maxDepth: number;
  topNodeTypes: Array<{ type: string; count: number }>;
}

export interface FileAnalysis {
  path: string;
  extension: SourceExtension;
  lines: number;
  bytes: number;
  riskScore: number;
  symbols: string[];
  imports: string[];
  selectors: string[];
  eventHandlers: string[];
  sideEffects: Record<SideEffectKind, number>;
  complexity: ComplexityMetrics;
  tree?: TreeSummary;
  notes: string[];
}

export interface DuplicateEvidence {
  count: number;
  files: string[];
}

export interface DuplicateSelector extends DuplicateEvidence {
  selector: string;
}

export interface DuplicateName extends DuplicateEvidence {
  symbol: string;
}

export interface ClusterSummary {
  name: string;
  files: number;
  lines: number;
  riskScore: number;
  topFiles: string[];
}

export interface Recommendation {
  title: string;
  body: string;
}

export interface ProjectSummary {
  files: number;
  lines: number;
  byExtension: Partial<Record<SourceExtension, { files: number; lines: number; riskScore: number }>>;
  highestRiskFile: string | null;
}

export interface StaticHtmlReport {
  targetRoot: string;
  generatedAt: string;
  summary: ProjectSummary;
  topFiles: FileAnalysis[];
  clusters: ClusterSummary[];
  duplicateSelectors: DuplicateSelector[];
  duplicateNames: DuplicateName[];
  recommendations: Recommendation[];
}

export interface ScriptParseResult {
  parseFailed: boolean;
  symbols: string[];
  imports: string[];
  tree?: TreeSummary;
}

export interface ScoreOptions {
  sizeWeight: number;
  extra: number;
}

export type PatternCounter = readonly [SideEffectKind, RegExp];
