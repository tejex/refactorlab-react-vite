#!/usr/bin/env node --experimental-strip-types
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createTypecheckRepairTicket } from "../src/core/repair/createTypecheckRepairTicket.ts";
import { buildRepairTicketArtifact, repairOutputPaths } from "../src/core/repair/repairArtifacts.ts";

const command = process.argv.slice(2);
const validatorCommand = command.length > 0 ? command : ["npm", "run", "build"];
const result = runCommand(validatorCommand);
const ticket = await createTypecheckRepairTicket({
  command: validatorCommand,
  output: result.output,
  readFile: readProjectFile,
});

if (!ticket) {
  console.log("No TypeScript repair ticket generated.");
  process.exit(result.exitCode === 0 ? 0 : 1);
}

if (ticket.targetFiles.length === 0) {
  throw new Error(`TypeScript diagnostic found, but target file could not be read: ${ticket.diagnostic.path}`);
}

const outputPath = path.resolve(repairOutputPaths.ticket);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, buildRepairTicketArtifact(ticket));
console.log(`Repair ticket written: ${repairOutputPaths.ticket}`);

interface CommandResult {
  exitCode: number;
  output: string;
}

function runCommand(commandParts: string[]): CommandResult {
  if (commandParts.length === 0) throw new Error("Repair ticket command cannot be empty.");

  try {
    const output = execFileSync(commandParts[0], commandParts.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: "pipe",
    });
    return { exitCode: 0, output };
  } catch (error) {
    if (!isCommandError(error)) throw error;
    return {
      exitCode: typeof error.status === "number" ? error.status : 1,
      output: `${bufferToText(error.stdout)}\n${bufferToText(error.stderr)}`,
    };
  }
}

function readProjectFile(filePath: string): Promise<string | null> {
  try {
    return Promise.resolve(readFileSync(path.resolve(filePath), "utf8"));
  } catch {
    return Promise.resolve(null);
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
