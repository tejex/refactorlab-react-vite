export interface EvidenceMetric {
  label: string;
  value: string;
}

export interface EvidenceItem {
  title: string;
  detail: string;
}

export interface ProjectEvidence {
  metrics: EvidenceMetric[];
  clusters: EvidenceItem[];
  topFiles: EvidenceItem[];
}

export type CapabilityStatus = "supported" | "partial" | "missing" | "inventory";

export interface ProjectCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  detected: number;
  detail: string;
  facts: string[];
}

export interface ProjectCapabilityMap {
  primaryLane: string;
  supported: number;
  partial: number;
  missing: number;
  inventory: number;
  capabilities: ProjectCapability[];
}

export type ExtractionSafety = "High" | "Medium" | "Low";

export interface InlineAssetBlock {
  file: string;
  kind: "style" | "script";
  location: "head" | "body";
  index: number;
  lineStart: number;
  lineEnd: number;
  lines: number;
  safety: ExtractionSafety;
  recommendedPath: string | null;
  replacement: string | null;
  warnings: string[];
  content: string;
}

export interface ExternalAssetOrder {
  file: string;
  stylesheets: string[];
  scripts: string[];
}

export interface GuaranteedSafeChange {
  file: string;
  kind: "style" | "script";
  lineStart: number;
  lineEnd: number;
  sourceLines: number;
  targetPath: string;
  action: "copy-only";
  content: string;
}

export interface InlineAssetPlan {
  blocks: InlineAssetBlock[];
  guaranteedSafeChanges: GuaranteedSafeChange[];
  externalOrder: ExternalAssetOrder[];
}

export type DeadCodeConfidence = "High" | "Review";

export interface DeadCodeCandidate {
  path: string;
  kind: "style" | "script" | "page" | "source";
  confidence: DeadCodeConfidence;
  reason: string;
  lines: number;
}

export interface DeadCodeMap {
  entrypoints: string[];
  reachableFiles: string[];
  unreachableFiles: DeadCodeCandidate[];
}

export interface DuplicateCssSelector {
  selector: string;
  count: number;
  sources: string[];
}

export interface DuplicateCssMap {
  repeatedSelectors: DuplicateCssSelector[];
}

export interface MissingReference {
  sourceFile: string;
  missingPath: string;
  kind: "script" | "style" | "image" | "page" | "asset" | "import";
}

export interface ProjectIntegrityMap {
  missingReferences: MissingReference[];
}

export interface JsTsModuleFile {
  path: string;
  imports: number;
  exports: number;
  sideEffects: number;
  behaviorBindings: BehaviorBinding[];
  resolvedImports: Array<{
    importPath: string;
    resolvedPath: string;
  }>;
  unresolvedImports: string[];
}

export interface JsTsModuleMap {
  files: JsTsModuleFile[];
  totalImports: number;
  totalExports: number;
  behaviorBindings: BehaviorBinding[];
  unresolvedImports: Array<{
    sourceFile: string;
    importPath: string;
  }>;
  resolvedImports: Array<{
    sourceFile: string;
    importPath: string;
    resolvedPath: string;
  }>;
}

export interface ReactRouteCandidate {
  sourceFile: string;
  routePath: string;
  componentName: string;
  title: string;
  stylesheets: number;
  scripts: number;
  inlineBlocks: number;
}

export interface ReactComponentCandidate {
  sourceFile: string;
  name: string;
  kind: string;
  selector: string;
  confidence: "High" | "Medium";
  signals: string[];
}

export interface BehaviorBinding {
  sourceFile: string;
  selector: string;
  kind: "event" | "delegated-event" | "direct-mutation" | "render-update";
  event: string;
  handler: string;
  effects: string[];
  targets: string[];
  endpoints: string[];
  line: number;
  confidence: "High" | "Medium" | "Review";
  componentName?: string;
  componentSelector?: string;
}

export interface ComponentOwnership {
  componentName: string;
  selector: string;
  confidence: "High" | "Medium";
  signals: string[];
  sourceFiles: string[];
  routesUsedIn: string[];
  locators: Array<{
    sourceFile: string;
    selector: string;
    lineStart: number;
    lineEnd: number;
    htmlBytes: number;
    childSummary: string[];
    tinyPreview: string;
  }>;
  cssSelectors: string[];
  behaviorBindings: BehaviorBinding[];
  assets: string[];
}

export interface RouteConversionPacket {
  slug: string;
  routePath: string;
  sourceFile: string;
  pageComponentName: string;
  title: string;
  componentOwners: ComponentOwnership[];
  behaviorBindings: BehaviorBinding[];
  cssSelectors: string[];
  assets: string[];
  blockers: MissingReference[];
  suggestedOrder: string[];
}

export interface AiHandoffStep {
  title: string;
  detail: string;
  facts: string[];
}

export interface AiHandoffPlan {
  status: "Ready" | "Prep needed" | "Review first";
  confidence: "High" | "Medium" | "Review";
  summary: string;
  primaryRoute: {
    routePath: string;
    sourceFile: string;
    packetSlug: string;
    componentOwners: number;
    behaviorBindings: number;
    blockers: number;
  } | null;
  steps: AiHandoffStep[];
  promptFacts: string[];
}

export interface ReactConversionMap {
  routes: ReactRouteCandidate[];
  routePackets: RouteConversionPacket[];
  aiHandoff: AiHandoffPlan;
  componentCandidates: ReactComponentCandidate[];
  componentOwnership: ComponentOwnership[];
  behaviorFiles: Array<{
    path: string;
    sideEffects: number;
  }>;
  behaviorBindings: BehaviorBinding[];
  blockers: MissingReference[];
}

export interface ProjectReport {
  sourceName: string;
  score: number;
  summary: string;
  evidence?: ProjectEvidence;
  capabilityMap?: ProjectCapabilityMap;
  inlineAssetPlan?: InlineAssetPlan;
  deadCodeMap?: DeadCodeMap;
  duplicateCssMap?: DuplicateCssMap;
  integrityMap?: ProjectIntegrityMap;
  jsTsModuleMap?: JsTsModuleMap;
  reactConversionMap?: ReactConversionMap;
}
