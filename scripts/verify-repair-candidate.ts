#!/usr/bin/env node --experimental-strip-types
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRepairCandidateToFiles, parseRepairCandidate } from "../src/core/repair/applyRepairCandidate.ts";
import { buildRepairResult } from "../src/core/repair/verifyRepairCandidate.ts";
import { buildRepairResultArtifact, repairOutputPaths } from "../src/core/repair/repairArtifacts.ts";
import type { RepairResult, RepairTicket, RepairValidationRun } from "../src/core/repair/repairTypes.ts";

const projectRoot = process.cwd();
const ticketPath = path.resolve(process.argv[2] ?? repairOutputPaths.ticket);
const candidatePath = path.resolve(process.argv[3] ?? repairOutputPaths.candidate);
const resultPath = path.resolve(process.argv[4] ?? repairOutputPaths.result);
const ticket = readJson<RepairTicket>(ticketPath);
const candidate = parseRepairCandidate(readJson<unknown>(candidatePath));
const tempRoot = createTempWorkspace(projectRoot);
let exitCode: number | undefined;

try {
  const fileMap = readTicketFiles(tempRoot, ticket);
  const applyResult = applyRepairCandidateToFiles(fileMap, ticket, candidate);
  if (applyResult.ok) writeAppliedFiles(tempRoot, applyResult.files, ticket);

  const validators = applyResult.ok ? ticket.validators.map((validator) => runValidator(validator.command, validator.timeoutMs, tempRoot)) : [];
  const result = buildRepairResult({ ticket, candidate, applyResult, validators });
  writeResult(resultPath, result);
  console.log(`Repair result written: ${path.relative(projectRoot, resultPath)}`);
  exitCode = result.accepted ? 0 : 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (exitCode !== undefined) process.exitCode = exitCode;

function createTempWorkspace(sourceRoot: string): string {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fixer-repair-"));
  cpSync(sourceRoot, tempRoot, {
    recursive: true,
    filter: (source) => shouldCopy(sourceRoot, source),
  });

  const sourceNodeModules = path.join(sourceRoot, "node_modules");
  if (existsSync(sourceNodeModules)) symlinkSync(sourceNodeModules, path.join(tempRoot, "node_modules"), "dir");
  return tempRoot;
}

function shouldCopy(sourceRoot: string, sourcePath: string): boolean {
  const relative = normalizeRelative(sourceRoot, sourcePath);
  if (!relative) return true;
  const topLevel = relative.split("/")[0];
  return ![".git", "node_modules", "dist", "fixer-output"].includes(topLevel);
}

function readTicketFiles(root: string, ticket: RepairTicket): Map<string, string> {
  return new Map(ticket.targetFiles.map((file) => [file.path, readFileSync(safeJoin(root, file.path), "utf8")]));
}

function writeAppliedFiles(root: string, files: Map<string, string>, ticket: RepairTicket) {
  const targetPaths = new Set(ticket.targetFiles.map((file) => file.path));
  for (const [filePath, text] of files) {
    if (!targetPaths.has(filePath)) continue;
    writeFileSync(safeJoin(root, filePath), text);
  }
}

function runValidator(command: string[], timeoutMs: number, cwd: string): RepairValidationRun {
  try {
    const output = execFileSync(command[0], command.slice(1), {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
      timeout: timeoutMs,
    });
    return { command, passed: true, exitCode: 0, outputExcerpt: sanitizeOutput(output, cwd) };
  } catch (error) {
    if (!isCommandError(error)) throw error;
    const output = `${bufferToText(error.stdout)}\n${bufferToText(error.stderr)}`;
    return {
      command,
      passed: false,
      exitCode: typeof error.status === "number" ? error.status : 1,
      outputExcerpt: sanitizeOutput(output, cwd),
    };
  }
}

function writeResult(filePath: string, result: RepairResult) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, buildRepairResultArtifact(result));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function safeJoin(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe path outside repair workspace: ${relativePath}`);
  return resolved;
}

function normalizeRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

type CommandError = Error & {
  status?: number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

function isCommandError(error: unknown): error is CommandError {
  return error instanceof Error;
}

function bufferToText(value: string | Buffer | undefined): string {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

function sanitizeOutput(output: string, tempRoot: string): string {
  return output.replaceAll(tempRoot, "<temp-workspace>").replaceAll(projectRoot, "<source-workspace>").slice(0, 4000);
}
