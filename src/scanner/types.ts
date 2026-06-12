export type SourceType = "github" | "archive";

export type StackId =
  | "lovable-react-supabase"
  | "static-html-api"
  | "next-shadcn"
  | "node-service"
  | "mixed-web-app";

export type RiskSeverity = "High" | "Medium" | "Info";

export interface ProjectInput {
  sourceName: string;
  sourceType: SourceType;
}

export interface StackRule {
  id: Exclude<StackId, "mixed-web-app">;
  label: string;
  signals: string[];
}

export interface Risk {
  severity: RiskSeverity;
  title: string;
  body: string;
}

export type RoadmapStep = [title: string, body: string];

export interface AgentReadiness {
  score: number;
  gaps: string[];
}

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

export interface ProjectReport {
  sourceName: string;
  sourceType: SourceType;
  score: number;
  summary: string;
  stacks: string[];
  risks: Risk[];
  roadmap: RoadmapStep[];
  agentReadiness: AgentReadiness;
  evidence?: ProjectEvidence;
}
