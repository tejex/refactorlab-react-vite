import { buildProjectRoots } from "../src/core/buildProjectRoots";
import { buildDeadCodeComparisonExportFile, buildDeadCodeComparisonMap } from "../src/scanner/deadCodeComparison";
import { buildDeadCodeMap } from "../src/scanner/projectMaps";
import type { ZipTextFile } from "../src/scanner/browserZip";

export function verifyDeadCodeComparison() {
  verifyRootAwareAudit();
  verifyCandidateBlocksCertainty();
}

function verifyRootAwareAudit() {
  const files = [
    textFile("index.html", `<script type="module" src="./app.js"></script><link rel="stylesheet" href="./style.css">`),
    textFile("app.js", `import "./shared.js";`),
    textFile("shared.js", `export const shared = true;`),
    textFile("style.css", `body { color: black; }`),
    textFile("workers/api.ts", `import "../worker-util.js"; export default { fetch() {} };`),
    textFile("worker-util.js", `export const workerUtil = true;`),
    textFile("scripts/seed.ts", `import "./seed-helper.js";`),
    textFile("scripts/seed-helper.js", `export const seed = true;`),
    textFile("src/unreferenced.ts", `export const unused = true;`),
    textFile("public/config.json", `{"public":true}`),
    textFile("package.json", JSON.stringify({ scripts: { seed: "tsx scripts/seed.ts" } })),
    textFile("tsconfig.json", JSON.stringify({ include: ["src/**/*.ts"] })),
    textFile("wrangler.json", JSON.stringify({ main: "workers/api.ts" })),
  ];
  const allPaths = [...files.map((file) => file.path), "public/logo.png"];
  const legacy = buildDeadCodeMap(files);
  const legacyBefore = stableJson(legacy);
  const roots = buildProjectRoots({ files, allPaths });
  const comparison = buildDeadCodeComparisonMap(files, legacy, roots, "eval-roots-hash");

  assertEqual(stableJson(legacy), legacyBefore, "legacy dead code map unchanged by comparison");
  assertIncludes(legacy.unreachableFiles.map((file) => file.path), "workers/api.ts", "legacy worker dead");
  assertIncludes(comparison.deltas.rescuedByRoots.map((file) => file.path), "workers/api.ts", "worker root rescues worker");
  assertIncludes(comparison.deltas.rescuedByRoots.map((file) => file.path), "worker-util.js", "worker root rescues dependency");
  assertIncludes(comparison.deltas.rescuedByRoots.map((file) => file.path), "scripts/seed.ts", "package script rescues script");
  assertIncludes(comparison.deltas.rescuedByRoots.map((file) => file.path), "scripts/seed-helper.js", "package script rescues dependency");
  assertIncludes(comparison.deltas.protectedArtifacts.map((file) => file.path), "public/config.json", "public text artifact protected");
  assertIncludes(comparison.deltas.protectedArtifacts.map((file) => file.path), "public/logo.png", "public binary artifact protected");
  assertIncludes(comparison.deltas.unchangedDead.map((file) => file.path), "src/unreferenced.ts", "tsconfig does not rescue source file");
  assertNotIncludes(comparison.rootAware.rootIdsAnalyzed, "root:typescript-project:tsconfig.json", "tsconfig is not execution root");
  assertIncludes(
    comparison.diagnostics.map((diagnostic) => diagnostic.path ?? ""),
    "tsconfig.json",
    "tsconfig diagnostic",
  );

  const exportFile = buildDeadCodeComparisonExportFile(comparison);
  assertEqual(exportFile.path, "project-ir/dead-code-comparison.json", "comparison export path");
  if (!String(exportFile.content).includes("eval-roots-hash")) throw new Error("[dead-code-comparison] export must include rootsMapHash");
}

function verifyCandidateBlocksCertainty() {
  const files = [
    textFile("index.html", `<main>Home</main>`),
    textFile("wrangler.toml", `name = "unknown-worker"`),
    textFile("loose.js", `export const loose = true;`),
  ];
  const legacy = buildDeadCodeMap(files);
  const roots = buildProjectRoots({ files, allPaths: files.map((file) => file.path) });
  const comparison = buildDeadCodeComparisonMap(files, legacy, roots, "candidate-hash");

  assertIncludes(roots.candidates.map((candidate) => candidate.id), "candidate:cloudflare-worker:wrangler-toml", "unresolved worker candidate");
  assertIncludes(comparison.deltas.blockedByCandidates.map((file) => file.path), "loose.js", "global candidate blocks loose file");
  assertEqual(comparison.deltas.blockedByCandidates.find((file) => file.path === "loose.js")?.rootAware.candidateBlockers[0]?.impact ?? "", "global", "global candidate impact");
}

function textFile(path: string, text: string): ZipTextFile {
  return { path, text, bytes: new TextEncoder().encode(text).byteLength };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertIncludes(values: string[], expected: string, label: string) {
  if (!values.includes(expected)) throw new Error(`[dead-code-comparison] ${label}: expected ${expected}`);
}

function assertNotIncludes(values: string[], expected: string, label: string) {
  if (values.includes(expected)) throw new Error(`[dead-code-comparison] ${label}: did not expect ${expected}`);
}

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`[dead-code-comparison] ${label}: expected ${expected}, got ${actual}`);
}
