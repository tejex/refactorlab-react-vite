import type { AiContextPackBuild } from "../src/scanner/aiContextPack";
import type { ConversionKitBuild } from "../src/scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../src/scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../src/scanner/routeStarterPack";

const textDecoder = new TextDecoder();

export function verifyContextPack(contextPack: AiContextPackBuild, fixtureName: string) {
  const output = outputMap(contextPack.files);
  const manifest = JSON.parse(requiredOutput(output, fixtureName, "fixer-ai-context-pack/context-pack-manifest.json")) as {
    stats: { routePackets: number; sourceReferences: number; sourceSnippets: number; outputFiles: number };
  };
  const projectMap = requiredOutput(output, fixtureName, "fixer-ai-context-pack/project-map.json");
  const sourceIndex = requiredOutput(output, fixtureName, "fixer-ai-context-pack/source-index.json");
  const retrievalManifest = requiredOutput(output, fixtureName, "fixer-ai-context-pack/retrieval-manifest.json");
  requiredOutput(output, fixtureName, "fixer-ai-context-pack/llm-prompt.md");
  requiredOutput(output, fixtureName, "fixer-ai-context-pack/routes/index.json");

  assertIncludes(projectMap, "\"sourceReferences\"", fixtureName, "context project map");
  assertIncludes(sourceIndex, "\"path\"", fixtureName, "context source index");
  assertIncludes(retrievalManifest, "source://", fixtureName, "context retrieval manifest");
  assertEqual(manifest.stats.outputFiles, contextPack.files.length, fixtureName, "context output file count");

  if (manifest.stats.routePackets < 1) throw new Error(`[${fixtureName}] context pack should include at least one route packet`);
  if (manifest.stats.sourceReferences < 1) throw new Error(`[${fixtureName}] context pack should include source references`);
  if (manifest.stats.sourceSnippets < 1) throw new Error(`[${fixtureName}] context pack should include source snippets`);
}

export function verifyMigrationPlan(migrationPlan: MigrationPlanPackBuild, fixtureName: string) {
  const output = outputMap(migrationPlan.files);
  const manifest = JSON.parse(requiredOutput(output, fixtureName, "fixer-migration-plan/migration-plan-manifest.json")) as {
    stats: { phases: number; outputFiles: number };
  };
  const planJson = requiredOutput(output, fixtureName, "fixer-migration-plan/migration-plan.json");
  const overview = requiredOutput(output, fixtureName, "fixer-migration-plan/00-overview.md");
  const instructions = requiredOutput(output, fixtureName, "fixer-migration-plan/10-ai-instructions.md");

  assertIncludes(planJson, "\"phases\"", fixtureName, "migration plan json");
  assertIncludes(overview, "Phase order", fixtureName, "migration overview");
  assertIncludes(instructions, "Read migration-plan.json", fixtureName, "migration AI instructions");
  assertEqual(manifest.stats.outputFiles, migrationPlan.files.length, fixtureName, "migration output file count");

  if (manifest.stats.phases < 1) throw new Error(`[${fixtureName}] migration plan should include phases`);
}

export function verifyRouteStarterPack(routeStarter: RouteStarterPackBuild, fixtureName: string) {
  const output = outputMap(routeStarter.files);
  const manifest = JSON.parse(requiredOutput(output, fixtureName, "fixer-route-starter-pack/route-starter-manifest.json")) as {
    route: { appPagePath: string; sourceFile: string };
    stats: { outputFiles: number; components: number };
  };
  const page = requiredOutput(output, fixtureName, manifest.route.appPagePath);
  const routePacket = requiredOutput(output, fixtureName, "fixer-route-starter-pack/source/route-packet.json");
  const selectorMap = requiredOutput(output, fixtureName, "fixer-route-starter-pack/source/selector-map.json");
  const instructions = requiredOutput(output, fixtureName, "fixer-route-starter-pack/source/ai-instructions.md");
  const cssModule = requiredOutput(output, fixtureName, `fixer-route-starter-pack/styles/${routeStarter.packet.slug}.module.css`);

  assertIncludes(page, "data-fixer-route", fixtureName, "route starter page");
  assertIncludes(page, ".module.css", fixtureName, "route starter page");
  assertIncludes(routePacket, manifest.route.sourceFile, fixtureName, "route starter packet");
  assertIncludes(selectorMap, "\"components\"", fixtureName, "route starter selector map");
  assertIncludes(instructions, "Read source/route-packet.json", fixtureName, "route starter instructions");
  assertIncludes(cssModule, ".route", fixtureName, "route starter css module");
  assertEqual(manifest.stats.outputFiles, routeStarter.files.length, fixtureName, "route starter output file count");

  const componentFile = routeStarter.files.find((file) => file.path.startsWith("fixer-route-starter-pack/components/"));
  if (componentFile) {
    const componentText = typeof componentFile.content === "string" ? componentFile.content : textDecoder.decode(componentFile.content);
    assertIncludes(componentText, "Parser facts", fixtureName, "route starter component facts");
  }
}

export function verifyConversionKit(conversionKit: ConversionKitBuild, fixtureName: string) {
  const output = outputMap(conversionKit.files);
  const manifest = JSON.parse(requiredOutput(output, fixtureName, "fixer-conversion-kit/conversion-kit-manifest.json")) as {
    stats: { packageMode: string; outputFiles: number; routePackets: number; assetManifestAssets: number; omittedVerifiedRewriteFiles: number };
  };
  const readme = requiredOutput(output, fixtureName, "fixer-conversion-kit/00-read-this-first.md");
  const queue = requiredOutput(output, fixtureName, "fixer-conversion-kit/route-queue.json");
  const assetManifest = requiredOutput(output, fixtureName, "fixer-conversion-kit/asset-manifest.json");
  const handoff = requiredOutput(output, fixtureName, "fixer-conversion-kit/llm-handoff.md");
  const rewriteSummary = requiredOutput(output, fixtureName, "fixer-conversion-kit/verified-rewrite/rewrite-summary.json");
  requiredOutput(output, fixtureName, "fixer-conversion-kit/target-profile.json");
  requiredOutput(output, fixtureName, "fixer-conversion-kit/ai-context-pack/project-map.json");
  requiredOutput(output, fixtureName, "fixer-conversion-kit/migration-plan/migration-plan.json");
  requiredOutput(output, fixtureName, "fixer-conversion-kit/route-starter-pack/source/route-packet.json");

  assertEqualString(manifest.stats.packageMode, "llm-slim", fixtureName, "conversion kit package mode");
  assertIncludes(readme, "Read order", fixtureName, "conversion kit readme");
  assertIncludes(readme, "LLM-slim", fixtureName, "conversion kit package shape");
  assertIncludes(assetManifest, "\"publicRoot\": \"public/\"", fixtureName, "conversion kit asset manifest");
  assertIncludes(assetManifest, "\"copyTo\"", fixtureName, "conversion kit asset copy plan");
  assertIncludes(assetManifest, "\"publicUrl\"", fixtureName, "conversion kit asset public url");
  assertIncludes(queue, "\"routePath\"", fixtureName, "conversion kit route queue");
  assertIncludes(queue, "\"status\"", fixtureName, "conversion kit route status");
  assertIncludes(queue, "\"difficulty\"", fixtureName, "conversion kit route difficulty");
  assertIncludes(queue, "\"reason\"", fixtureName, "conversion kit route reason");
  assertIncludes(queue, "\"dependsOn\"", fixtureName, "conversion kit route dependencies");
  assertIncludes(queue, "\"suggestedNext\"", fixtureName, "conversion kit suggested next routes");
  assertIncludes(handoff, "Convert one route at a time", fixtureName, "conversion kit handoff");
  assertIncludes(rewriteSummary, "\"packageMode\": \"summary-only\"", fixtureName, "conversion kit rewrite summary");
  assertEqual(manifest.stats.outputFiles, conversionKit.files.length, fixtureName, "conversion kit output file count");

  if (manifest.stats.routePackets < 1) throw new Error(`[${fixtureName}] conversion kit should include route packets`);
  if (manifest.stats.assetManifestAssets < 1) throw new Error(`[${fixtureName}] conversion kit should include asset manifest entries`);
  if (manifest.stats.omittedVerifiedRewriteFiles < 1) throw new Error(`[${fixtureName}] conversion kit should omit full rewrite files`);
  if ([...output.keys()].some((path) => /fixer-conversion-kit\/verified-rewrite\/.+\.html$/.test(path))) {
    throw new Error(`[${fixtureName}] conversion kit should not include full verified rewrite HTML files`);
  }
}

function outputMap(files: Array<{ path: string; content: string | Uint8Array }>): Map<string, string> {
  return new Map(
    files.map((file) => [
      file.path,
      typeof file.content === "string" ? file.content : textDecoder.decode(file.content),
    ]),
  );
}

function requiredOutput(output: Map<string, string>, fixtureName: string, filePath: string): string {
  const text = output.get(filePath);
  if (text === undefined) throw new Error(`[${fixtureName}] missing expected output: ${filePath}`);
  return text;
}

function assertIncludes(text: string, snippet: string, fixtureName: string, label: string) {
  if (!text.includes(snippet)) throw new Error(`[${fixtureName}] ${label} should include: ${snippet}`);
}

function assertEqual(actual: number, expected: number, fixtureName: string, label: string) {
  if (actual !== expected) throw new Error(`[${fixtureName}] ${label}: expected ${expected}, got ${actual}`);
}

function assertEqualString(actual: string, expected: string, fixtureName: string, label: string) {
  if (actual !== expected) throw new Error(`[${fixtureName}] ${label}: expected ${expected}, got ${actual}`);
}
