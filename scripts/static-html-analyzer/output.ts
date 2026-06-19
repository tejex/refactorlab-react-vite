import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StaticHtmlReport } from "./types.ts";

export function saveReport(report: StaticHtmlReport, savedPath: string): void {
  mkdirSync(path.dirname(savedPath), { recursive: true });
  writeFileSync(savedPath, `${JSON.stringify(report, null, 2)}\n`);
}

export function printReport(result: StaticHtmlReport, savedPath: string | null): void {
  console.log("fixer.ai static HTML/JS scan")
  console.log(`Target: ${result.targetRoot}`)
  console.log(`Files: ${result.summary.files}`)
  console.log(`Lines: ${result.summary.lines}`)
  console.log(`Highest-risk file: ${result.summary.highestRiskFile}`)
  console.log("")
  console.log("Top clusters:")
  for (const cluster of result.clusters.slice(0, 5)) {
    console.log(`- ${cluster.name}: ${cluster.files} files, ${cluster.lines} lines, risk ${cluster.riskScore}`);
  }
  console.log("")
  console.log("Top files:")
  for (const file of result.topFiles.slice(0, 8)) {
    console.log(`- ${file.path}: ${file.lines} lines, risk ${file.riskScore}`)
  }
  console.log("")
  if (savedPath) console.log(`Saved JSON: ${savedPath}`)
  else console.log("Saved JSON: skipped")
}
