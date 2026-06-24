import { buildProjectRoots, defaultProjectRootDetectors } from "../src/core/buildProjectRoots";
import type { ProjectRootDetector } from "../src/core/roots";
import type { ZipTextFile } from "../src/scanner/browserZip";

export function verifyProjectRootsDiscovery() {
  const files = rootFixtureFiles();
  const allPaths = rootFixturePaths(files);
  const first = buildProjectRoots({ files, allPaths });
  const second = buildProjectRoots({ files, allPaths });
  const reversed = buildProjectRoots({ files, allPaths, detectors: [...defaultProjectRootDetectors].reverse() });

  assertEqual(stableJson(first), stableJson(second), "deterministic output");
  assertEqual(stableJson(first), stableJson(reversed), "detector order independence");
  assertIncludes(first.roots.map((root) => root.id), "root:html-route:/", "home route");
  assertIncludes(first.roots.map((root) => root.id), "root:html-route:api/usage", "nested route");
  assertIncludes(first.roots.map((root) => root.id), "root:cloudflare-worker:workers/api.ts", "worker root");
  assertIncludes(first.roots.map((root) => root.id), "root:supabase-function:archive-image", "supabase function root");
  assertIncludes(first.roots.map((root) => root.id), "root:package-command:seed", "package command root");
  assertIncludes(first.roots.map((root) => root.id), "root:typescript-project:tsconfig.json", "typescript root");
  assertIncludes(first.roots.map((root) => root.id), "root:test:src/app.test.ts", "test root");
  assertIncludes(first.preservedArtifacts.map((artifact) => artifact.id), "artifact:public:public/logo.png", "public artifact");
  assertIncludes(first.preservedArtifacts.map((artifact) => artifact.id), "artifact:migration:supabase/migrations/001_init.sql", "migration artifact");

  if (first.roots.some((root) => root.path === "public/logo.png" || root.path === "supabase/migrations/001_init.sql")) {
    throw new Error("[project-roots] public resources and migrations must not become roots");
  }

  assertNotIncludes(first.roots.map((root) => root.id), "root:package-command:missing", "unresolved package command");
  assertNotIncludes(first.roots.map((root) => root.id), "root:cloudflare-worker:src/worker.ts", "explicit Wrangler config overrides convention");
  assertNotIncludes(first.roots.map((root) => root.id), "root:supabase-function:disabled-task", "explicit Supabase config disables convention");
  assertNoUnstableStrings(first, ["/tmp/", "var/folders", "Users/", "fixture-a", "fixture-b"]);
  verifyUnknownCandidateVisibility();
  verifyAbsoluteWorkspaceIndependence(files, allPaths);
  verifyDetectorFailureIsolation(files, allPaths);
}

function rootFixtureFiles(): ZipTextFile[] {
  return [
    textFile("index.html", "<main>Home</main>"),
    textFile("api/usage.html", "<main>Usage</main>"),
    textFile("workers/api.ts", "export default { fetch() {} };"),
    textFile("src/worker.ts", "export default { fetch() {} };"),
    textFile("supabase/functions/archive-image/index.ts", "Deno.serve(() => new Response('ok'));"),
    textFile("supabase/functions/disabled-task/index.ts", "Deno.serve(() => new Response('disabled'));"),
    textFile("supabase/config.toml", "[functions.archive-image]\nenabled = true\n\n[functions.disabled-task]\nenabled = false\n"),
    textFile("package.json", JSON.stringify({ scripts: { seed: "tsx scripts/seed.ts", missing: "tsx scripts/missing.ts", deploy: "wrangler deploy" } })),
    textFile("scripts/seed.ts", "console.log('seed');"),
    textFile("tsconfig.json", JSON.stringify({ compilerOptions: {} })),
    textFile("src/app.test.ts", "import './app';"),
    textFile("wrangler.json", JSON.stringify({ main: "workers/api.ts" })),
    textFile("wrangler.toml", "name = \"fixture\""),
  ];
}

function rootFixturePaths(files: ZipTextFile[]): string[] {
  return [...files.map((file) => file.path), "public/logo.png", "supabase/migrations/001_init.sql"].sort();
}

function verifyAbsoluteWorkspaceIndependence(files: ZipTextFile[], allPaths: string[]) {
  const firstRoot = "/tmp/fixture-a";
  const secondRoot = "/var/folders/fixture-b";
  const first = buildProjectRoots({
    projectRoot: firstRoot,
    files: prefixFiles(files, firstRoot),
    allPaths: prefixPaths(allPaths, firstRoot),
  });
  const second = buildProjectRoots({
    projectRoot: secondRoot,
    files: prefixFiles(files, secondRoot),
    allPaths: prefixPaths(allPaths, secondRoot),
  });

  assertEqual(stableJson(first), stableJson(second), "absolute workspace independence");
  assertNoUnstableStrings(first, [firstRoot, secondRoot, "fixture-a", "fixture-b"]);
}

function verifyUnknownCandidateVisibility() {
  const files = [textFile("wrangler.toml", "name = \"unknown-worker\"")];
  const result = buildProjectRoots({ files, allPaths: files.map((file) => file.path) });
  assertIncludes(result.candidates.map((candidate) => candidate.id), "candidate:cloudflare-worker:wrangler-toml", "unknown Worker candidate");
}

function verifyDetectorFailureIsolation(files: ZipTextFile[], allPaths: string[]) {
  const failingDetector: ProjectRootDetector = {
    id: "intentional-failure",
    detect() {
      throw new Error("intentional detector failure");
    },
  };
  const result = buildProjectRoots({ files, allPaths, detectors: [failingDetector, ...defaultProjectRootDetectors] });

  assertIncludes(result.diagnostics.map((diagnostic) => diagnostic.detector), "intentional-failure", "detector failure diagnostic");
  assertIncludes(result.roots.map((root) => root.id), "root:html-route:/", "other detectors survive failure");
}

function textFile(path: string, text: string): ZipTextFile {
  return { path, text, bytes: new TextEncoder().encode(text).byteLength };
}

function prefixFiles(files: ZipTextFile[], root: string): ZipTextFile[] {
  return files.map((file) => ({ ...file, path: `${root}/${file.path}` }));
}

function prefixPaths(paths: string[], root: string): string[] {
  return paths.map((path) => `${root}/${path}`);
}

function assertIncludes(values: string[], expected: string, label: string) {
  if (!values.includes(expected)) throw new Error(`[project-roots] ${label}: expected ${expected}`);
}

function assertNotIncludes(values: string[], expected: string, label: string) {
  if (values.includes(expected)) throw new Error(`[project-roots] ${label}: did not expect ${expected}`);
}

function assertEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) throw new Error(`[project-roots] ${label}: expected ${expected}, got ${actual}`);
}

function assertNoUnstableStrings(value: unknown, forbidden: string[]) {
  const output = stableJson(value);
  const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  if (timestampPattern.test(output)) throw new Error("[project-roots] canonical output must not include timestamps");
  for (const item of forbidden) {
    if (output.includes(item)) throw new Error(`[project-roots] canonical output must not include unstable string: ${item}`);
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
