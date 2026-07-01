#!/usr/bin/env node --experimental-strip-types
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyRepairCandidateToFiles } from "../src/core/repair/applyRepairCandidate.ts";
import { createTypecheckRepairTicket } from "../src/core/repair/createTypecheckRepairTicket.ts";
import { buildRepairResult } from "../src/core/repair/verifyRepairCandidate.ts";
import { buildRepairResultArtifact, buildRepairTicketArtifact, repairOutputPaths, stableJson } from "../src/core/repair/repairArtifacts.ts";
import type { RepairCandidate, RepairTicket, RepairValidationRun } from "../src/core/repair/repairTypes.ts";

const evalRoot = mkdtempSync(path.join(os.tmpdir(), "fixer-repair-eval-"));
const fixtureRoot = path.join(evalRoot, "fixture");
const repoNodeModules = path.resolve("node_modules");

try {
  createFixture(fixtureRoot);
  const failure = runCommand(["npm", "run", "typecheck"], fixtureRoot);
  const ticket = await createTypecheckRepairTicket({
    command: ["npm", "run", "typecheck"],
    output: failure.output,
    readFile: (filePath) => Promise.resolve(readFileSync(path.join(fixtureRoot, filePath), "utf8")),
  });

  if (!ticket) throw new Error("[repair-loop] expected typecheck ticket");
  assertEqual(ticket.type, "typecheck-error", "ticket type");
  assertEqual(ticket.targetFiles[0]?.path ?? "", "src/index.ts", "target file");
  assertIncludes(buildRepairTicketArtifact(ticket), "TS2322", "ticket artifact diagnostic");

  const accepted = verifyCandidateInTemp(fixtureRoot, ticket, {
    schemaVersion: "repair-candidate.v0",
    ticketId: ticket.ticketId,
    edits: [
      {
        path: "src/index.ts",
        before: `const total: number = "broken";`,
        after: `const total: number = 42;`,
      },
    ],
  });
  assertEqual(accepted.accepted ? "yes" : "no", "yes", "accepted candidate");
  assertIncludes(buildRepairResultArtifact(accepted), "candidate-verified", "accepted result artifact");

  const rejected = verifyCandidateInTemp(fixtureRoot, ticket, {
    schemaVersion: "repair-candidate.v0",
    ticketId: ticket.ticketId,
    edits: [
      {
        path: "src/index.ts",
        before: `const total: number = "broken";`,
        after: `const total: number = "still broken";`,
      },
    ],
  });
  assertEqual(rejected.accepted ? "yes" : "no", "no", "rejected candidate");
  assertIncludes(rejected.reason, "validator-failed", "rejected result reason");
  assertIncludes(readFileSync(path.join(fixtureRoot, "src/index.ts"), "utf8"), `"broken"`, "source tree remains unchanged");
  assertIncludes(stableJson(accepted), "realSourceModified", "result includes real source flag");

  console.log("Repair loop eval passed");
} finally {
  rmSync(evalRoot, { recursive: true, force: true });
}

function createFixture(root: string) {
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module", scripts: { typecheck: "tsc --noEmit" } }, null, 2));
  writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2023" }, include: ["src"] }, null, 2));
  writeFileSync(path.join(root, "src/index.ts"), `const total: number = "broken";\nconsole.log(total);\n`);
  if (existsSync(repoNodeModules)) symlinkSync(repoNodeModules, path.join(root, "node_modules"), "dir");
}

function verifyCandidateInTemp(sourceRoot: string, ticket: RepairTicket, candidate: RepairCandidate) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fixer-repair-apply-"));
  try {
    cpSync(sourceRoot, tempRoot, {
      recursive: true,
      filter: (source) => !source.endsWith("/node_modules"),
    });
    if (existsSync(repoNodeModules)) symlinkSync(repoNodeModules, path.join(tempRoot, "node_modules"), "dir");

    const files = new Map(ticket.targetFiles.map((file) => [file.path, readFileSync(path.join(tempRoot, file.path), "utf8")]));
    const applyResult = applyRepairCandidateToFiles(files, ticket, candidate);
    if (applyResult.ok) {
      for (const [filePath, text] of applyResult.files) writeFileSync(path.join(tempRoot, filePath), text);
    }
    const validators = applyResult.ok ? ticket.validators.map((validator) => runValidator(validator.command, validator.timeoutMs, tempRoot)) : [];
    const result = buildRepairResult({ ticket, candidate, applyResult, validators });
    mkdirSync(path.dirname(path.join(tempRoot, repairOutputPaths.result)), { recursive: true });
    writeFileSync(path.join(tempRoot, repairOutputPaths.result), buildRepairResultArtifact(result));
    return result;
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

interface CommandResult {
  exitCode: number;
  output: string;
}

function runValidator(command: string[], timeoutMs: number, cwd: string): RepairValidationRun {
  const result = runCommand(command, cwd, timeoutMs);
  return {
    command,
    passed: result.exitCode === 0,
    exitCode: result.exitCode,
    outputExcerpt: result.output.slice(0, 4000),
  };
}

function runCommand(command: string[], cwd: string, timeout = 120_000): CommandResult {
  try {
    const output = execFileSync(command[0], command.slice(1), { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout });
    return { exitCode: 0, output };
  } catch (error) {
    if (!isCommandError(error)) throw error;
    return {
      exitCode: typeof error.status === "number" ? error.status : 1,
      output: `${bufferToText(error.stdout)}\n${bufferToText(error.stderr)}`,
    };
  }
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

function assertIncludes(text: string, expected: string, label: string) {
  if (!text.includes(expected)) throw new Error(`[repair-loop] ${label}: expected ${expected}`);
}

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`[repair-loop] ${label}: expected ${expected}, got ${actual}`);
}
