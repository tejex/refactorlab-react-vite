import { assertSafeRepairPath, stableRepairHash } from "./repairArtifacts.ts";
import type { RepairCandidate, RepairFileEdit, RepairResult, RepairTicket } from "./repairTypes.ts";

export interface RepairApplyResult {
  ok: boolean;
  files: Map<string, string>;
  appliedEdits: RepairResult["appliedEdits"];
  diagnostics: string[];
}

export function parseRepairCandidate(value: unknown): RepairCandidate {
  if (!isRecord(value)) throw new Error("Repair candidate must be a JSON object.");
  if (value.schemaVersion !== "repair-candidate.v0") throw new Error("Unsupported repair candidate schema.");
  if (typeof value.ticketId !== "string") throw new Error("Repair candidate is missing ticketId.");
  if (!Array.isArray(value.edits)) throw new Error("Repair candidate is missing edits.");

  return {
    schemaVersion: "repair-candidate.v0",
    ticketId: value.ticketId,
    edits: value.edits.map(parseRepairFileEdit),
    notes: typeof value.notes === "string" ? value.notes : undefined,
  };
}

export function applyRepairCandidateToFiles(
  files: Map<string, string>,
  ticket: RepairTicket,
  candidate: RepairCandidate,
): RepairApplyResult {
  const normalizedFiles = normalizeFileMap(files);
  const diagnostics = validateRepairCandidate(ticket, candidate, normalizedFiles);
  if (diagnostics.length > 0) return { ok: false, files: normalizedFiles, appliedEdits: [], diagnostics };

  const appliedEdits: RepairResult["appliedEdits"] = [];
  for (const edit of candidate.edits) {
    const path = assertSafeRepairPath(edit.path);
    const current = normalizedFiles.get(path);
    if (current === undefined) {
      diagnostics.push(`Candidate edit target is missing: ${path}`);
      break;
    }

    const matches = countOccurrences(current, edit.before);
    if (matches !== 1) {
      diagnostics.push(`Candidate edit for ${path} must match exactly once; found ${matches}.`);
      break;
    }

    const next = current.replace(edit.before, edit.after);
    normalizedFiles.set(path, next);
    appliedEdits.push({
      path,
      beforeHash: stableRepairHash(current),
      afterHash: stableRepairHash(next),
    });
  }

  return {
    ok: diagnostics.length === 0,
    files: normalizedFiles,
    appliedEdits: diagnostics.length === 0 ? appliedEdits : [],
    diagnostics,
  };
}

function validateRepairCandidate(ticket: RepairTicket, candidate: RepairCandidate, files: Map<string, string>): string[] {
  const diagnostics: string[] = [];
  if (candidate.ticketId !== ticket.ticketId) diagnostics.push("Repair candidate ticketId does not match ticket.");
  if (candidate.edits.length === 0) diagnostics.push("Repair candidate must include at least one edit.");
  if (candidate.edits.length > ticket.limits.maxEdits) diagnostics.push(`Repair candidate exceeds max edit count: ${ticket.limits.maxEdits}.`);

  const allowedPaths = new Set(ticket.targetFiles.map((file) => file.path));
  const editedPaths = new Set<string>();
  for (const edit of candidate.edits) {
    const path = assertSafeRepairPath(edit.path);
    editedPaths.add(path);
    if (!allowedPaths.has(path)) diagnostics.push(`Candidate edit is outside the repair ticket target: ${path}`);
    if (edit.before.length === 0) diagnostics.push(`Candidate edit for ${path} has empty before text.`);
  }

  if (editedPaths.size > ticket.limits.maxFiles) diagnostics.push(`Repair candidate exceeds max file count: ${ticket.limits.maxFiles}.`);

  for (const targetFile of ticket.targetFiles) {
    const current = files.get(targetFile.path);
    if (current === undefined) {
      diagnostics.push(`Repair target file is missing: ${targetFile.path}`);
      continue;
    }
    const currentHash = stableRepairHash(current);
    if (currentHash !== targetFile.contentHash) {
      diagnostics.push(`Repair target changed since ticket generation: ${targetFile.path}`);
    }
  }

  return diagnostics;
}

function parseRepairFileEdit(value: unknown): RepairFileEdit {
  if (!isRecord(value)) throw new Error("Repair edit must be a JSON object.");
  if (typeof value.path !== "string") throw new Error("Repair edit is missing path.");
  if (typeof value.before !== "string") throw new Error("Repair edit is missing before text.");
  if (typeof value.after !== "string") throw new Error("Repair edit is missing after text.");
  return {
    path: assertSafeRepairPath(value.path),
    before: value.before,
    after: value.after,
  };
}

function normalizeFileMap(files: Map<string, string>): Map<string, string> {
  return new Map([...files].map(([path, text]) => [assertSafeRepairPath(path), text]));
}

function countOccurrences(text: string, search: string): number {
  return search ? text.split(search).length - 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
