import { estimateRepairTokens } from "./estimateRepairTokens.ts";
import { assertSafeRepairPath, normalizeRepairPath, stableRepairHash } from "./repairArtifacts.ts";
import type { RepairCommand, RepairTargetFile, RepairTicket, TypecheckDiagnostic } from "./repairTypes.ts";

export interface CreateTypecheckRepairTicketInput {
  command: string[];
  output: string;
  readFile: (filePath: string) => Promise<string | null>;
  timeoutMs?: number;
}

export async function createTypecheckRepairTicket(input: CreateTypecheckRepairTicketInput): Promise<RepairTicket | null> {
  const diagnostic = parseTypeScriptDiagnostics(input.output)[0];
  if (!diagnostic) return null;

  const targetFiles = await buildTargetFiles(diagnostic, input.readFile);
  const ticketWithoutEstimate = {
    schemaVersion: "repair-ticket.v0",
    type: "typecheck-error",
    ticketId: buildTicketId(diagnostic),
    summary: `${diagnostic.code} in ${diagnostic.path}:${diagnostic.line}`,
    diagnostic,
    targetFiles,
    validators: [buildValidator(input.command, input.timeoutMs)],
    limits: {
      maxFiles: 1,
      maxEdits: 3,
    },
  } satisfies Omit<RepairTicket, "tokenEstimate">;

  return {
    ...ticketWithoutEstimate,
    tokenEstimate: estimateRepairTokens(ticketWithoutEstimate),
  };
}

export function parseTypeScriptDiagnostics(output: string): TypecheckDiagnostic[] {
  const diagnostics: TypecheckDiagnostic[] = [];
  const pattern = /(^|\n)([^()\n]+\.tsx?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+([^\n]+)/g;
  for (const match of output.matchAll(pattern)) {
    const path = assertSafeRepairPath(normalizeRepairPath(match[2].trim()));
    diagnostics.push({
      path,
      line: Number(match[3]),
      column: Number(match[4]),
      code: match[5],
      message: match[6].trim(),
      raw: match[0].trim(),
    });
  }
  return diagnostics;
}

function buildTicketId(diagnostic: TypecheckDiagnostic): string {
  return `repair:typecheck-error:${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${stableRepairHash(diagnostic.raw)}`;
}

async function buildTargetFiles(
  diagnostic: TypecheckDiagnostic,
  readFile: CreateTypecheckRepairTicketInput["readFile"],
): Promise<RepairTargetFile[]> {
  const text = await readFile(diagnostic.path);
  if (text === null) return [];
  return [
    {
      path: diagnostic.path,
      contentHash: stableRepairHash(text),
      excerpt: sourceExcerpt(text, diagnostic.line),
      excerptStartLine: Math.max(1, diagnostic.line - 4),
    },
  ];
}

function sourceExcerpt(text: string, centerLine: number): string {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, centerLine - 5);
  const end = Math.min(lines.length, centerLine + 4);
  return lines.slice(start, end).join("\n");
}

function buildValidator(command: string[], timeoutMs = 120_000): RepairCommand {
  return {
    command,
    timeoutMs,
  };
}
