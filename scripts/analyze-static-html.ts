#!/usr/bin/env node --experimental-strip-types
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveReport, printReport } from "./static-html-analyzer/output.ts";
import { analyzeProject } from "./static-html-analyzer/project-analyzer.ts";
import { buildReport } from "./static-html-analyzer/report-builder.ts";

const targetArg = process.argv[2];
if (!targetArg) {
  throw new Error("Usage: npm run analyze:static -- path/to/project-or-zip [output.json]");
}

const targetInput = path.resolve(targetArg);
const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : null;

const workspace = prepareInput(targetInput);
const analyses = analyzeProject(workspace.root);
const report = buildReport(workspace.root, analyses);

if (outputPath) saveReport(report, outputPath);
printReport(report, outputPath);

workspace.cleanup();

function prepareInput(inputPath: string): { root: string; cleanup: () => void } {
  if (!existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stats = statSync(inputPath);
  if (stats.isDirectory()) {
    return { root: inputPath, cleanup: () => undefined };
  }

  if (path.extname(inputPath).toLowerCase() !== ".zip") {
    throw new Error(`Unsupported input file. Expected a .zip archive or directory: ${inputPath}`);
  }

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fixer-static-scan-"));
  execFileSync("unzip", ["-q", inputPath, "-d", tempRoot], { stdio: "pipe" });

  return {
    root: resolveExtractedRoot(tempRoot),
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true }),
  };
}

function resolveExtractedRoot(tempRoot: string): string {
  const entries = readdirSync(tempRoot).filter((entry) => entry !== "__MACOSX" && !entry.startsWith("."));
  if (entries.length !== 1) return tempRoot;

  const candidate = path.join(tempRoot, entries[0]);
  return statSync(candidate).isDirectory() ? candidate : tempRoot;
}
