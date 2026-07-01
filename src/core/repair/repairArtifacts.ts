import type { RepairResult, RepairTicket } from "./repairTypes.ts";

export const repairOutputPaths = {
  ticket: "fixer-output/repair/repair-ticket.json",
  candidate: "fixer-output/repair/repair-candidate.json",
  result: "fixer-output/repair/repair-result.json",
};

export function buildRepairTicketArtifact(ticket: RepairTicket): string {
  return stableJson(ticket);
}

export function buildRepairResultArtifact(result: RepairResult): string {
  return stableJson(result);
}

export function normalizeRepairPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function assertSafeRepairPath(filePath: string): string {
  const normalized = normalizeRepairPath(filePath);
  const parts = normalized.split("/");
  if (!normalized || normalized.startsWith("../") || parts.includes("..") || filePath.includes("\0")) {
    throw new Error(`Unsafe repair path: ${filePath}`);
  }
  return normalized;
}

export function stableRepairHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJson((value as Record<string, unknown>)[key]);
  }
  return sorted;
}
