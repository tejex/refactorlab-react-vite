import { buildProjectIntegrityMap } from "../src/scanner/projectMaps";
import { groupProjectBlockers } from "../src/scanner/projectBlockers";
import type { ZipTextFile } from "../src/scanner/browserZip";

export function verifyProjectIntegrityResolution() {
  const textFiles: ZipTextFile[] = [
    {
      path: "api/docs/index.html",
      bytes: 0,
      text: `
        <base href="/api/">
        <link rel="stylesheet" href="dashboard.css">
        <script src="layout.js"></script>
        <a href="docs/index.html">Docs</a>
      `,
    },
    {
      path: "blog/index.html",
      bytes: 0,
      text: `
        <a href="/api">API</a>
        <a href="/studio">Studio</a>
      `,
    },
    {
      path: "studio/index.html",
      bytes: 0,
      text: `<a href="/community/">Community</a>`,
    },
    {
      path: "pricing.html",
      bytes: 0,
      text: `<a href="/community/">Community</a>`,
    },
  ];
  const allPaths = [
    "api/docs/index.html",
    "api/dashboard.css",
    "api/layout.js",
    "api/index.html",
    "studio/index.html",
    "blog/index.html",
    "pricing.html",
  ];
  const integrity = buildProjectIntegrityMap(textFiles, allPaths);
  const missing = integrity.missingReferences.map((reference) => `${reference.sourceFile}:${reference.kind}:${reference.missingPath}`);
  const groups = groupProjectBlockers(integrity.missingReferences);

  assertMissing(missing, "studio/index.html:page:community/");
  assertEqual(groups.length, 1, "grouped blocker target count");
  assertEqual(groups[0]?.count ?? 0, 2, "grouped blocker reference count");
  assertNotMissing(missing, "api/docs/index.html:style:api/dashboard.css");
  assertNotMissing(missing, "api/docs/index.html:script:api/layout.js");
  assertNotMissing(missing, "api/docs/index.html:page:api/docs/index.html");
  assertNotMissing(missing, "blog/index.html:page:api");
  assertNotMissing(missing, "blog/index.html:page:studio");
}

function assertMissing(missing: string[], expected: string) {
  if (!missing.includes(expected)) throw new Error(`[project-integrity] expected missing reference: ${expected}`);
}

function assertNotMissing(missing: string[], unexpected: string) {
  if (missing.includes(unexpected)) throw new Error(`[project-integrity] unexpected missing reference: ${unexpected}`);
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`[project-integrity] ${label}: expected ${expected}, got ${actual}`);
}
