#!/usr/bin/env node --experimental-strip-types
import path from "node:path";
import { fileURLToPath } from "node:url";
import { saveReport, printReport } from "./static-html-analyzer/output.ts";
import { analyzeProject } from "./static-html-analyzer/project-analyzer.ts";
import { buildReport } from "./static-html-analyzer/report-builder.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultTarget = path.join(repoRoot, "fixtures", "tokensmith-main");

const targetRoot = path.resolve(process.argv[2] ?? defaultTarget);
const outputPath = path.resolve(process.argv[3] ?? path.join(repoRoot, "reports", "tokensmith-static-analysis.json"));

const analyses = analyzeProject(targetRoot);
const report = buildReport(targetRoot, analyses);

saveReport(report, outputPath);
printReport(report, outputPath);
