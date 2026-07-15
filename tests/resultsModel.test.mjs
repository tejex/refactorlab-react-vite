import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  actionsDisabled,
  contextCompositionFromReport,
  contextMetricsFromReport,
  fileContextDistributionFromReport,
  formatTokenCount,
  methodologyRows,
  packetActionFeedback,
  repositoryStatusFromReport,
  segmentedContextModel,
} from "../src/components/resultsModel.ts";

function sampleReport() {
  return {
    repoName: "a-very-long-repository-name-that-must-remain-readable-without-breaking-the-window",
    totals: {
      totalFiles: 114,
      estimatedSourceTokens: 45_413,
    },
    verification: {
      hasCiConfig: false,
      commands: [
        { category: "build" },
        { category: "typecheck_included" },
      ],
    },
    packageScopes: [{ declaredEntry: null, declaredEntryExists: null }, {}],
    entrypoints: [
      { proofLevel: "confirmed" },
      { proofLevel: "confirmed" },
    ],
    analyzerCoverage: [
      {
        analyzerId: "javascript-package",
        status: "complete",
        analyzedFileCount: 2,
        excludedLanguages: [],
      },
      {
        analyzerId: "javascript-entrypoints",
        status: "partial",
        analyzedFileCount: 4,
        excludedLanguages: [],
      },
      {
        analyzerId: "javascript-typescript-imports",
        status: "partial",
        analyzedFileCount: 79,
        excludedLanguages: ["CSS"],
      },
    ],
    portability: {
      machineSpecificAbsoluteImports: 0,
    },
    repoGraph: {
      unresolvedLocalStaticReferences: 0,
    },
    contextClassification: {
      totals: {
        totalReadableTokens: 266_255,
        defaultAiContextTokens: 45_413,
        defaultAiContextFiles: 94,
        generatedReferenceTokens: 105_568,
        dependencyLockfileTokens: 114_388,
        buildOutputTokens: 0,
        vendoredDependencyTokens: 0,
        runtimeDataTokens: 886,
      },
      files: [
        eligibleFile("src/dashboard.tsx", 12_000, "React TSX"),
        eligibleFile("src/report.tsx", 9_000, "React TSX"),
        eligibleFile("src/scanner.ts", 8_000),
        eligibleFile("src/packet.ts", 7_000),
        eligibleFile("src/context.ts", 5_000),
        eligibleFile("src/main.ts", 4_413),
        classifiedFile("generated/client.ts", 105_568, "include_summary"),
      ],
    },
    tokenization: {
      tokenizer: "tiktoken-rs",
      method: "exact",
      encoding: "o200k_base",
      fallbackUsed: false,
    },
    repoDigest: {
      packetTokens: 2_075,
    },
    tokenAccounting: {
      aiEligibleRepositoryTokens: 45_413,
      repositoryPacketTokens: 2_075,
      potentiallyAvoidableContextTokens: 43_338,
      potentialInputTokenReductionPercent: 95,
    },
  };
}

function eligibleFile(path, estimatedTokens, language = "TypeScript") {
  return classifiedFile(path, estimatedTokens, "include_full", language);
}

function classifiedFile(
  path,
  estimatedTokens,
  contextPolicy,
  language = "TypeScript",
) {
  return {
    path,
    language,
    estimatedTokens,
    classification: { contextPolicy },
  };
}

test("reads and formats all five context values from typed report fields", () => {
  const metrics = contextMetricsFromReport(sampleReport());
  const rows = methodologyRows(metrics);

  assert.deepEqual(rows, [
    ["Total readable repository context", "266,255 tokens"],
    ["AI-eligible repository context", "45,413 tokens"],
    ["Repository-packet tokens", "2,075 tokens"],
    ["Potentially avoidable context", "43,338 tokens"],
    ["Potential input-token reduction", "95%"],
  ]);
  assert.equal(formatTokenCount(12_345_678), "12,345,678");
});

test("handles zero-token repositories without division errors", () => {
  const report = sampleReport();
  report.tokenAccounting = {
    aiEligibleRepositoryTokens: 0,
    repositoryPacketTokens: 0,
    potentiallyAvoidableContextTokens: 0,
    potentialInputTokenReductionPercent: 0,
  };

  const bar = segmentedContextModel(contextMetricsFromReport(report));
  assert.equal(bar.packetPercent, 0);
  assert.equal(bar.avoidablePercent, 0);
  assert.match(bar.accessibleLabel, /Repository packet: 0 tokens/);
});

test("never displays negative reduction when the packet is larger", () => {
  const report = sampleReport();
  report.tokenAccounting = {
    aiEligibleRepositoryTokens: 100,
    repositoryPacketTokens: 125,
    potentiallyAvoidableContextTokens: 0,
    potentialInputTokenReductionPercent: 0,
  };

  const metrics = contextMetricsFromReport(report);
  const bar = segmentedContextModel(metrics);
  assert.equal(metrics.potentiallyAvoidableContextTokens, 0);
  assert.equal(metrics.potentialInputTokenReductionPercent, 0);
  assert.equal(bar.packetPercent, 125);
  assert.equal(bar.packetWidthPercent, 100);
});

test("marks incomplete accounting unavailable instead of inventing a reduction", () => {
  const report = sampleReport();
  delete report.tokenAccounting;
  delete report.repoDigest;

  const metrics = contextMetricsFromReport(report);
  const bar = segmentedContextModel(metrics);
  assert.equal(metrics.accountingAvailable, false);
  assert.equal(metrics.potentiallyAvoidableContextTokens, null);
  assert.equal(metrics.potentialInputTokenReductionPercent, null);
  assert.equal(bar.available, false);
});

test("uses unsupported and not analyzed labels instead of false zeroes", () => {
  const report = sampleReport();
  report.packageScopes = [];
  report.entrypoints = [];
  report.verification.commands = [];
  report.analyzerCoverage = [
    {
      analyzerId: "rust-ecosystem",
      status: "unsupported",
      analyzedFileCount: 0,
      excludedLanguages: ["Rust"],
    },
  ];

  const status = Object.fromEntries(
    repositoryStatusFromReport(report).map((item) => [item.label, item.value]),
  );
  assert.equal(status.Packages, "Unsupported");
  assert.equal(status.Entrypoints, "Not analyzed");
  assert.equal(status.Build, "Unsupported");
  assert.equal(status["Import analysis"], "Not analyzed");
});

test("provides accessible segmented-bar text with tokens and percentages", () => {
  const bar = segmentedContextModel(contextMetricsFromReport(sampleReport()));
  assert.match(bar.accessibleLabel, /45,413 tokens/);
  assert.match(bar.accessibleLabel, /43,338 tokens, 95 percent/);
  assert.match(bar.accessibleLabel, /2,075 tokens, 5 percent/);
});

test("builds a deterministic largest-to-smallest file distribution", () => {
  const report = sampleReport();
  report.contextClassification.files.push(
    eligibleFile("/Users/private/machine-file.ts", 99_999),
  );
  const distribution = fileContextDistributionFromReport(report);

  assert.equal(distribution.available, true);
  assert.equal(distribution.totalFileCount, 6);
  assert.equal(distribution.totalTokens, 45_413);
  assert.deepEqual(
    distribution.points.map((point) => point.path),
    [
      "src/dashboard.tsx",
      "src/report.tsx",
      "src/scanner.ts",
      "src/packet.ts",
      "src/context.ts",
      "src/main.ts",
    ],
  );
  assert.deepEqual(
    distribution.topFiles.map((file) => file.path),
    distribution.points.slice(0, 5).map((point) => point.path),
  );
  assert.deepEqual(
    distribution.topFiles.map((file) => file.displayName),
    ["dashboard.tsx", "report.tsx", "scanner.ts", "packet.ts", "context.ts"],
  );
  assert.equal(distribution.points[0].label, "dashboard.tsx");
  assert.match(distribution.accessibleLabel, /ordered largest to smallest/);
  assert.equal(distribution.accessibleLabel.includes("\/Users\/private"), false);
});

test("large file distributions represent every file in deterministic buckets", () => {
  const report = sampleReport();
  report.contextClassification.files = Array.from({ length: 250 }, (_, index) =>
    eligibleFile(`src/file-${String(index).padStart(3, "0")}.ts`, 250 - index),
  );

  const distribution = fileContextDistributionFromReport(report, 100);
  assert.equal(distribution.bucketed, true);
  assert.equal(distribution.displayedBarCount, 100);
  assert.equal(
    distribution.points.reduce((sum, point) => sum + point.fileCount, 0),
    250,
  );
  assert.equal(distribution.points[0].rankStart, 1);
  assert.equal(distribution.points.at(-1).rankEnd, 250);
  assert.match(distribution.accessibleLabel, /100 deterministic rank buckets/);
});

test("readable context composition reconciles exact non-overlapping categories", () => {
  const composition = contextCompositionFromReport(sampleReport());
  assert.equal(composition.available, true);
  assert.equal(composition.totalTokens, 266_255);
  assert.equal(
    composition.items.reduce((sum, item) => sum + item.tokens, 0),
    composition.totalTokens,
  );
  assert.deepEqual(
    composition.items.map((item) => item.label),
    ["AI-eligible", "Generated/reference", "Lockfiles", "Runtime data"],
  );
  assert.match(composition.accessibleLabel, /All readable repository context/);
});

test("invalid context composition fails closed instead of publishing a misleading bar", () => {
  const report = sampleReport();
  report.contextClassification.totals.generatedReferenceTokens = 300_000;
  const composition = contextCompositionFromReport(report);
  assert.equal(composition.available, false);
  assert.equal(composition.items.length, 0);
});

test("copy and download feedback covers success, failure, and busy state", () => {
  assert.deepEqual(packetActionFeedback("copy", "success"), {
    kind: "success",
    message: "Copied",
  });
  assert.equal(packetActionFeedback("copy", "error").kind, "error");
  assert.equal(packetActionFeedback("download", "success").message, "Packet downloaded");
  assert.equal(packetActionFeedback("download", "error").kind, "error");
  assert.equal(actionsDisabled("copying"), true);
  assert.equal(actionsDisabled(null), false);
});

test("active results UI uses disclosure, responsive text, and approved wording", async () => {
  const files = await Promise.all(
    [
      "../src/App.tsx",
      "../src/components/ReportView.tsx",
      "../src/components/HeroCostVerdict.tsx",
      "../src/components/ContextMethodologyDisclosure.tsx",
      "../src/components/CompactHeader.tsx",
      "../src/components/ContextDistributionPanel.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const source = files.join("\n").toLowerCase();

  for (const prohibited of [
    "tokens saved",
    "money saved",
    "success probability",
    "retry reduction",
  ]) {
    assert.equal(source.includes(prohibited), false, prohibited);
  }

  assert.match(files[3], /<details/);
  assert.match(files[3], /<summary/);
  assert.equal(files[3].includes("ContextCompositionBar"), false);
  assert.match(files[1], /<ContextCompositionBar report=\{report\} \/>/);
  assert.ok(
    files[1].indexOf("<ContextCompositionBar") <
      files[1].indexOf("<ContextMethodologyDisclosure"),
  );
  assert.match(files[4], /break-words/);
  assert.match(files[5], /File context distribution/);
  assert.match(files[5], /maximumDistributionBars = 20/);
  assert.equal(files[5].includes("recharts"), false);
  assert.match(files[5], /\{file\.displayName\}/);
  assert.equal(files[5].includes("Exact repository-relative paths"), false);
  assert.equal(source.includes("repodigest.sections"), false);
  assert.equal(source.includes("rendered markdown"), false);
});

test("active UI keeps secondary copy readable", async () => {
  const componentSources = await Promise.all(
    [
      "../src/components/HeroCostVerdict.tsx",
      "../src/components/SegmentedContextBar.tsx",
      "../src/components/ContextCompositionBar.tsx",
      "../src/components/ContextDistributionPanel.tsx",
      "../src/components/ContextMethodologyDisclosure.tsx",
      "../src/components/RepositoryStatus.tsx",
      "../src/components/CompactHeader.tsx",
      "../src/components/PacketActions.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /--muted-foreground: 0 0% 72%/);
  for (const source of componentSources) {
    assert.equal(source.includes("text-[9px]"), false);
    assert.equal(source.includes("text-[10px]"), false);
    assert.equal(source.includes("text-[11px]"), false);
  }
});

test("token transformation uses an aligned connector instead of a floating arrow", async () => {
  const hero = await readFile(
    new URL("../src/components/HeroCostVerdict.tsx", import.meta.url),
    "utf8",
  );

  assert.match(hero, /grid-cols-\[minmax\(0,max-content\)_minmax\(96px,1fr\)_minmax\(0,max-content\)\]/);
  assert.match(hero, /h-px min-w-4 flex-1 bg-border/);
  assert.equal(hero.includes("pb-6"), false);
});
