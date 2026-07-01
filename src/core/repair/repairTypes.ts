export type RepairTicketKind = "typecheck-error";

export interface RepairCommand {
  command: string[];
  timeoutMs: number;
}

export interface TypecheckDiagnostic {
  path: string;
  line: number;
  column: number;
  code: string;
  message: string;
  raw: string;
}

export interface RepairTargetFile {
  path: string;
  contentHash: string;
  excerpt: string;
  excerptStartLine: number;
}

export interface RepairTicket {
  schemaVersion: "repair-ticket.v0";
  type: RepairTicketKind;
  ticketId: string;
  summary: string;
  diagnostic: TypecheckDiagnostic;
  targetFiles: RepairTargetFile[];
  validators: RepairCommand[];
  limits: {
    maxFiles: number;
    maxEdits: number;
  };
  tokenEstimate: number;
}

export interface RepairFileEdit {
  path: string;
  before: string;
  after: string;
}

export interface RepairCandidate {
  schemaVersion: "repair-candidate.v0";
  ticketId: string;
  edits: RepairFileEdit[];
  notes?: string;
}

export interface RepairValidationRun {
  command: string[];
  passed: boolean;
  exitCode: number;
  outputExcerpt: string;
}

export interface RepairResult {
  schemaVersion: "repair-result.v0";
  ticketId: string;
  accepted: boolean;
  reason: string;
  realSourceModified: false;
  appliedEdits: Array<{
    path: string;
    beforeHash: string;
    afterHash: string;
  }>;
  validators: RepairValidationRun[];
  diagnostics: string[];
}
