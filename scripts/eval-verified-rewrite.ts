import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildAiContextPackFromEntries } from "../src/scanner/aiContextPack";
import { buildConversionKitFromArtifacts } from "../src/scanner/conversionKit";
import { buildInlineAssetPlan } from "../src/scanner/extractionPlan";
import { buildMigrationPlanPack } from "../src/scanner/migrationPlanPack";
import { buildDeadCodeMap, buildDuplicateCssMap, buildProjectIntegrityMap } from "../src/scanner/projectMaps";
import { buildRouteStarterPack } from "../src/scanner/routeStarterPack";
import { buildVerifiedInlineExtractionRewrite, verifiedInlineExtractionBlocks } from "../src/scanner/verifiedRewriteEngine";
import type { ZipProjectEntry, ZipTextFile } from "../src/scanner/browserZip";
import type { ProjectReport } from "../src/scanner/types";
import { verifyContextPack, verifyConversionKit, verifyMigrationPlan, verifyRouteStarterPack } from "./eval-artifact-packs";
import { verifyProjectIntegrityResolution } from "./eval-project-integrity";
import { buildEvalReactConversionMap } from "./eval-react-conversion-map";

interface EvalExpected {
  applied: number;
  rejected: number;
  excludedOriginalFiles: string[];
  files: string[];
  rewrittenHtml?: {
    path: string;
    contains: string[];
    notContains: string[];
  };
  generated: Array<{
    path: string;
    contains: string[];
  }>;
}

interface EvalResult {
  fixture: string;
  applied: number;
  rejected: number;
  excluded: number;
  files: number;
  localRefs: number;
  contextFiles: number;
  contextRefs: number;
  contextSnippets: number;
  migrationFiles: number;
  migrationPhases: number;
  migrationBlockers: number;
  starterFiles: number;
  starterComponents: number;
  kitFiles: number;
}

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, "eval-fixtures", "rewrite");
const textDecoder = new TextDecoder();

await stat(fixtureRoot);

const results: EvalResult[] = [];
for (const fixtureName of await listFixtureNames(fixtureRoot)) {
  results.push(await runFixture(fixtureName));
}
verifyProjectIntegrityResolution();

console.log("\nVerified rewrite evals passed");
console.table(results);

async function runFixture(fixtureName: string): Promise<EvalResult> {
  const fixtureDir = path.join(fixtureRoot, fixtureName);
  const inputDir = path.join(fixtureDir, "input");
  const expected = await readJson<EvalExpected>(path.join(fixtureDir, "expected.json"));
  const entries = await readFixtureEntries(inputDir);
  const textFiles = entries
    .filter((entry): entry is ZipProjectEntry & { text: string } => entry.text !== null)
    .map<ZipTextFile>((entry) => ({ path: entry.path, text: entry.text, bytes: entry.bytes.byteLength }));
  const inlineAssetPlan = buildInlineAssetPlan(textFiles);
  const allPaths = entries.map((entry) => entry.path);
  const deadCodeMap = buildDeadCodeMap(textFiles);
  const duplicateCssMap = buildDuplicateCssMap(textFiles);
  const integrityMap = buildProjectIntegrityMap(textFiles, allPaths);
  const reactConversionMap = buildEvalReactConversionMap(fixtureName, textFiles, inlineAssetPlan.blocks.length, integrityMap.missingReferences);
  const report: ProjectReport = {
    sourceName: fixtureName,
    score: 100,
    summary: `${fixtureName} eval fixture`,
    inlineAssetPlan,
    deadCodeMap,
    duplicateCssMap,
    integrityMap,
    reactConversionMap,
  };
  const safeBlocks = verifiedInlineExtractionBlocks(report);
  const rewrite = buildVerifiedInlineExtractionRewrite(entries, fixtureName, safeBlocks);
  const output = outputMap(rewrite.files);
  const contextPack = buildAiContextPackFromEntries(entries, textFiles, report);
  const migrationPlan = buildMigrationPlanPack(report);
  const routeStarter = buildRouteStarterPack(report);
  const conversionKit = buildConversionKitFromArtifacts(report, {
    contextPack,
    migrationPlan,
    routeStarter,
    verifiedRewrite: rewrite,
  });

  assertEqual(rewrite.manifest.applied.length, expected.applied, fixtureName, "applied rewrite count");
  assertEqual(rewrite.manifest.rejected.length, expected.rejected, fixtureName, "rejected rewrite count");
  assertSameSet(rewrite.manifest.excludedOriginalFiles, expected.excludedOriginalFiles, fixtureName, "excluded original files");
  assertSameSet([...output.keys()], expected.files, fixtureName, "output file list");
  verifyContextPack(contextPack, fixtureName);
  verifyMigrationPlan(migrationPlan, fixtureName);
  verifyRouteStarterPack(routeStarter, fixtureName);
  verifyConversionKit(conversionKit, fixtureName);

  if (expected.rewrittenHtml) {
    const html = requiredOutput(output, fixtureName, expected.rewrittenHtml.path);
    for (const snippet of expected.rewrittenHtml.contains) {
      assertIncludes(html, snippet, fixtureName, expected.rewrittenHtml.path);
    }
    for (const snippet of expected.rewrittenHtml.notContains) {
      assertNotIncludes(html, snippet, fixtureName, expected.rewrittenHtml.path);
    }
  }

  for (const generated of expected.generated) {
    const text = requiredOutput(output, fixtureName, generated.path);
    for (const snippet of generated.contains) {
      assertIncludes(text, snippet, fixtureName, generated.path);
    }
  }

  const localRefs = verifyLocalHtmlReferences(output, fixtureName);
  return {
    fixture: fixtureName,
    applied: rewrite.manifest.applied.length,
    rejected: rewrite.manifest.rejected.length,
    excluded: rewrite.manifest.excludedOriginalFiles.length,
    files: rewrite.files.length,
    localRefs,
    contextFiles: contextPack.files.length,
    contextRefs: contextPack.stats.sourceReferences,
    contextSnippets: contextPack.stats.sourceSnippets,
    migrationFiles: migrationPlan.files.length,
    migrationPhases: migrationPlan.stats.phases,
    migrationBlockers: migrationPlan.stats.blockers,
    starterFiles: routeStarter.files.length,
    starterComponents: routeStarter.stats.components,
    kitFiles: conversionKit.files.length,
  };
}

async function listFixtureNames(root: string): Promise<string[]> {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function readFixtureEntries(inputDir: string, directory = inputDir): Promise<ZipProjectEntry[]> {
  const entries: ZipProjectEntry[] = [];
  for (const dirent of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...(await readFixtureEntries(inputDir, absolutePath)));
      continue;
    }

    if (!dirent.isFile()) continue;

    const relativePath = normalizePath(path.relative(inputDir, absolutePath));
    const bytes = await readFile(absolutePath);
    entries.push({
      path: relativePath,
      bytes: new Uint8Array(bytes),
      text: isAnalyzableSource(relativePath) ? textDecoder.decode(bytes) : null,
    });
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function outputMap(files: Array<{ path: string; content: string | Uint8Array }>): Map<string, string> {
  return new Map(
    files.map((file) => [
      normalizePath(file.path),
      typeof file.content === "string" ? file.content : textDecoder.decode(file.content),
    ]),
  );
}

function verifyLocalHtmlReferences(output: Map<string, string>, fixtureName: string): number {
  let checked = 0;
  for (const [filePath, text] of output) {
    if (!filePath.endsWith(".html")) continue;
    for (const reference of extractHtmlReferences(text)) {
      if (isExternalReference(reference)) continue;
      const resolved = resolveReferencePath(filePath, reference);
      checked += 1;
      if (!output.has(resolved)) {
        throw new Error(`[${fixtureName}] ${filePath} references missing output file: ${reference} -> ${resolved}`);
      }
    }
  }

  return checked;
}

function extractHtmlReferences(text: string): string[] {
  const references: string[] = [];
  for (const match of text.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    references.push(match[1]);
  }
  return references;
}

function resolveReferencePath(sourceFile: string, reference: string): string {
  const cleanReference = reference.split(/[?#]/, 1)[0] ?? "";
  if (cleanReference.startsWith("/")) return `fixer-verified-rewrite/${cleanReference.replace(/^\/+/, "")}`;
  const sourceDirectory = sourceFile.slice(0, sourceFile.lastIndexOf("/") + 1);
  return normalizePath(path.posix.join(sourceDirectory, cleanReference));
}

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z]+:|#)/i.test(reference) || reference.startsWith("//");
}

function requiredOutput(output: Map<string, string>, fixtureName: string, filePath: string): string {
  const text = output.get(filePath);
  if (text === undefined) throw new Error(`[${fixtureName}] missing expected output: ${filePath}`);
  return text;
}

function assertIncludes(text: string, snippet: string, fixtureName: string, label: string) {
  if (!text.includes(snippet)) throw new Error(`[${fixtureName}] ${label} should include: ${snippet}`);
}

function assertNotIncludes(text: string, snippet: string, fixtureName: string, label: string) {
  if (text.includes(snippet)) throw new Error(`[${fixtureName}] ${label} should not include: ${snippet}`);
}

function assertEqual(actual: number, expected: number, fixtureName: string, label: string) {
  if (actual !== expected) throw new Error(`[${fixtureName}] ${label}: expected ${expected}, got ${actual}`);
}

function assertSameSet(actual: string[], expected: string[], fixtureName: string, label: string) {
  const normalizedActual = [...actual].map(normalizePath).sort();
  const normalizedExpected = [...expected].map(normalizePath).sort();
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    throw new Error(
      `[${fixtureName}] ${label} mismatch\nexpected: ${normalizedExpected.join(", ")}\nactual: ${normalizedActual.join(", ")}`,
    );
  }
}

function isAnalyzableSource(filePath: string): boolean {
  return [".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".json"].some((extension) =>
    filePath.toLowerCase().endsWith(extension),
  );
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
