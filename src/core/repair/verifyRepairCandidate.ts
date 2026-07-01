import type { RepairApplyResult } from "./applyRepairCandidate.ts";
import type { RepairCandidate, RepairResult, RepairTicket, RepairValidationRun } from "./repairTypes.ts";

export interface BuildRepairResultInput {
  ticket: RepairTicket;
  candidate: RepairCandidate;
  applyResult: RepairApplyResult;
  validators: RepairValidationRun[];
}

export function buildRepairResult(input: BuildRepairResultInput): RepairResult {
  const diagnostics = [...input.applyResult.diagnostics];
  if (input.candidate.ticketId !== input.ticket.ticketId) diagnostics.push("Repair candidate ticketId does not match ticket.");

  const failedValidator = input.validators.find((validator) => !validator.passed);
  const accepted = input.applyResult.ok && !failedValidator;

  return {
    schemaVersion: "repair-result.v0",
    ticketId: input.ticket.ticketId,
    accepted,
    reason: resultReason(input.applyResult.ok, failedValidator),
    realSourceModified: false,
    appliedEdits: accepted ? input.applyResult.appliedEdits : [],
    validators: input.validators,
    diagnostics,
  };
}

function resultReason(applied: boolean, failedValidator: RepairValidationRun | undefined): string {
  if (!applied) return "candidate-edits-rejected";
  if (failedValidator) return `validator-failed:${failedValidator.command.join(" ")}`;
  return "candidate-verified";
}
