import type { ZipFileInput } from "./zipWriter";

export const contextPackRoot = "fixer-ai-context-pack";
export const maxContextReferences = 220;
export const maxContextSnippets = 60;
export const maxSnippetLines = 80;
export const maxSnippetChars = 8_000;

export interface AiContextPackStats {
  sourceFiles: number;
  routes: number;
  routePackets: number;
  componentOwners: number;
  behaviorBindings: number;
  blockers: number;
  verifiedRewrites: number;
  sourceReferences: number;
  sourceSnippets: number;
  outputFiles: number;
  sourceTextBytes: number;
  packTextBytes: number;
  estimatedSourceTokens: number;
  estimatedPackTokens: number;
  estimatedTokenReduction: number;
}

export interface AiContextPackManifest {
  source: string;
  generatedAt: string;
  purpose: string;
  recommendedUse: string[];
  limits: {
    maxReferences: number;
    maxSnippets: number;
    maxSnippetLines: number;
    maxSnippetChars: number;
  };
  stats: AiContextPackStats;
  files: string[];
}

export interface SourceIndexEntry {
  path: string;
  kind: string;
  bytes: number;
  lines: number;
}

export interface SourceReferenceRecord {
  id: string;
  category: "route-source" | "component-owner" | "behavior-binding" | "verified-rewrite";
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  reason: string;
  sourceRef: string;
  snippetPath: string | null;
  available: boolean;
}

export interface SourceReferenceInput {
  category: SourceReferenceRecord["category"];
  sourceFile: string;
  lineStart: number;
  lineEnd: number;
  reason: string;
}

export interface BuiltSourceReferences {
  references: SourceReferenceRecord[];
  snippetFiles: ZipFileInput[];
}

export interface AiContextPackBuild {
  files: ZipFileInput[];
  manifest: AiContextPackManifest;
  stats: AiContextPackStats;
  sourceIndex: SourceIndexEntry[];
  sourceReferences: SourceReferenceRecord[];
}
