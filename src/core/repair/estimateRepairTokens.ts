import type { RepairTicket } from "./repairTypes.ts";

export function estimateRepairTokens(ticket: Omit<RepairTicket, "tokenEstimate">): number {
  return estimateTextTokens(JSON.stringify(ticket));
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
