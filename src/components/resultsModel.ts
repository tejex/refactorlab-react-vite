import type { AnalyzerCoverage, RepoScanReport } from "../types";

export type PacketAction = "choosing" | "scanning" | "copying" | "downloading";

export interface ActionFeedback {
  kind: "success" | "error";
  message: string;
}

export interface ContextMetrics {
  accountingAvailable: boolean;
  aiEligibleRepositoryTokens: number | null;
  repositoryPacketTokens: number | null;
  potentiallyAvoidableContextTokens: number | null;
  potentialInputTokenReductionPercent: number | null;
  totalReadableRepositoryTokens: number | null;
  aiEligibleFileCount: number | null;
  totalReadableFileCount: number | null;
  tokenizer: string | null;
  encoding: string | null;
  method: string | null;
  fallbackUsed: boolean;
}

export interface SegmentedContextModel {
  available: boolean;
  avoidablePercent: number;
  packetPercent: number | null;
  avoidableWidthPercent: number;
  packetWidthPercent: number;
  showPacketMarker: boolean;
  accessibleLabel: string;
}

export interface RepositoryStatusItem {
  label: string;
  value: string;
  state: "detected" | "neutral" | "warning";
}

export interface FileContextPoint {
  key: string;
  label: string;
  path: string | null;
  language: string | null;
  tokens: number;
  totalTokens: number;
  fileCount: number;
  rankStart: number;
  rankEnd: number;
}

export interface FileContextContributor {
  path: string;
  language: string;
  tokens: number;
  sharePercent: number;
}

export interface FileContextDistribution {
  available: boolean;
  totalFileCount: number;
  totalTokens: number;
  displayedBarCount: number;
  bucketed: boolean;
  points: FileContextPoint[];
  topFiles: FileContextContributor[];
  largestFileSharePercent: number;
  topFiveSharePercent: number;
  accessibleLabel: string;
}

export type ContextCompositionTone =
  | "eligible"
  | "generated"
  | "lockfile"
  | "build"
  | "vendored"
  | "runtime"
  | "other";

export interface ContextCompositionItem {
  id: string;
  label: string;
  tokens: number;
  percent: number;
  tone: ContextCompositionTone;
}

export interface ContextComposition {
  available: boolean;
  totalTokens: number;
  items: ContextCompositionItem[];
  accessibleLabel: string;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatTokenCount(value: number | null | undefined) {
  return value == null ? "—" : numberFormatter.format(nonNegative(value));
}

export function contextMetricsFromReport(report: RepoScanReport): ContextMetrics {
  const accounting = report.tokenAccounting;
  const classification = report.contextClassification?.totals;

  return {
    accountingAvailable: Boolean(accounting),
    aiEligibleRepositoryTokens: accounting
      ? nonNegative(accounting.aiEligibleRepositoryTokens)
      : optionalNonNegative(classification?.defaultAiContextTokens),
    repositoryPacketTokens: accounting
      ? nonNegative(accounting.repositoryPacketTokens)
      : optionalNonNegative(report.repoDigest?.packetTokens),
    potentiallyAvoidableContextTokens: accounting
      ? nonNegative(accounting.potentiallyAvoidableContextTokens)
      : null,
    potentialInputTokenReductionPercent: accounting
      ? clampPercent(accounting.potentialInputTokenReductionPercent)
      : null,
    totalReadableRepositoryTokens: optionalNonNegative(
      classification?.totalReadableTokens,
    ),
    aiEligibleFileCount: optionalNonNegative(
      classification?.defaultAiContextFiles,
    ),
    totalReadableFileCount: optionalNonNegative(report.totals?.totalFiles),
    tokenizer: report.tokenization?.tokenizer ?? null,
    encoding: report.tokenization?.encoding ?? null,
    method: report.tokenization?.method ?? null,
    fallbackUsed: report.tokenization?.fallbackUsed ?? false,
  };
}

export function segmentedContextModel(
  metrics: ContextMetrics,
): SegmentedContextModel {
  const eligible = metrics.aiEligibleRepositoryTokens;
  const packet = metrics.repositoryPacketTokens;
  const reduction = metrics.potentialInputTokenReductionPercent;

  if (!metrics.accountingAvailable || eligible == null || packet == null || reduction == null) {
    return {
      available: false,
      avoidablePercent: 0,
      packetPercent: null,
      avoidableWidthPercent: 0,
      packetWidthPercent: 0,
      showPacketMarker: false,
      accessibleLabel: "Context comparison is unavailable for this report.",
    };
  }

  if (eligible === 0) {
    const hasPacket = packet > 0;
    return {
      available: true,
      avoidablePercent: 0,
      packetPercent: hasPacket ? null : 0,
      avoidableWidthPercent: 0,
      packetWidthPercent: hasPacket ? 100 : 0,
      showPacketMarker: hasPacket,
      accessibleLabel: hasPacket
        ? `AI-eligible repository context: 0 tokens. Repository packet: ${formatTokenCount(packet)} tokens. Potential input-token reduction: 0 percent. Packet percentage is not comparable because the eligible context is zero.`
        : "AI-eligible repository context: 0 tokens. Repository packet: 0 tokens. Potential input-token reduction: 0 percent.",
    };
  }

  const packetRatio = (packet / eligible) * 100;
  const packetWidth = Math.min(100, Math.max(0, packetRatio));
  const avoidableWidth = Math.max(0, 100 - packetWidth);
  const packetPercent = Math.round(packetRatio);

  return {
    available: true,
    avoidablePercent: reduction,
    packetPercent,
    avoidableWidthPercent: avoidableWidth,
    packetWidthPercent: packetWidth,
    showPacketMarker: packet > 0,
    accessibleLabel: `AI-eligible repository context: ${formatTokenCount(eligible)} tokens. Potentially avoidable context: ${formatTokenCount(metrics.potentiallyAvoidableContextTokens)} tokens, ${reduction} percent. Repository packet: ${formatTokenCount(packet)} tokens, ${packetPercent} percent of eligible context.`,
  };
}

export function repositoryStatusFromReport(
  report: RepoScanReport,
): RepositoryStatusItem[] {
  const unsupported = report.analyzerCoverage.some(
    (coverage) => coverage.status === "unsupported",
  );
  const packageCoverage = coverageById(report.analyzerCoverage, "javascript-package");
  const entrypointCoverage = coverageById(
    report.analyzerCoverage,
    "javascript-entrypoints",
  );
  const importCoverage = coverageById(
    report.analyzerCoverage,
    "javascript-typescript-imports",
  );
  const commands = report.verification.commands ?? [];
  const hasBuild = commands.some((command) => command.category === "build");
  const hasTest = commands.some((command) => command.category === "test");
  const hasDedicatedTypecheck = commands.some(
    (command) => command.category === "typecheck",
  );
  const hasIncludedTypecheck = commands.some(
    (command) => command.category === "typecheck_included",
  );
  const confirmedEntrypoints = report.entrypoints.filter(
    (entrypoint) => entrypoint.proofLevel === "confirmed",
  ).length;
  const packageAnalysisAvailable = packageCoverage?.status === "complete";
  const entrypointAnalysisAvailable = ["complete", "partial"].includes(
    entrypointCoverage?.status ?? "",
  );
  const importAnalysisAvailable = ["complete", "partial"].includes(
    importCoverage?.status ?? "",
  );

  return [
    {
      label: "Packages",
      value: report.packageScopes.length
        ? `${report.packageScopes.length.toLocaleString("en-US")} detected`
        : unsupported && !packageAnalysisAvailable
          ? "Unsupported"
          : "None detected",
      state: report.packageScopes.length ? "detected" : "neutral",
    },
    {
      label: "Entrypoints",
      value: confirmedEntrypoints
        ? `${confirmedEntrypoints.toLocaleString("en-US")} confirmed`
        : entrypointAnalysisAvailable
          ? "None confirmed"
          : "Not analyzed",
      state: confirmedEntrypoints ? "detected" : "neutral",
    },
    {
      label: "Build",
      value: hasBuild
        ? "Detected"
        : packageAnalysisAvailable
          ? "Not detected"
          : "Unsupported",
      state: hasBuild ? "detected" : "neutral",
    },
    {
      label: "Typecheck",
      value: hasDedicatedTypecheck
        ? "Dedicated command"
        : hasIncludedTypecheck
          ? "Included in build"
          : packageAnalysisAvailable
            ? "Not detected"
            : "Unsupported",
      state: hasDedicatedTypecheck || hasIncludedTypecheck ? "detected" : "neutral",
    },
    {
      label: "Tests",
      value: hasTest
        ? "Detected"
        : packageAnalysisAvailable
          ? "Not detected"
          : "Unsupported",
      state: hasTest ? "detected" : "neutral",
    },
    {
      label: "CI",
      value: report.verification.hasCiConfig ? "Detected" : "Not detected",
      state: report.verification.hasCiConfig ? "detected" : "neutral",
    },
    {
      label: "Import analysis",
      value: importAnalysisAvailable
        ? `${report.repoGraph.unresolvedLocalStaticReferences.toLocaleString("en-US")} unresolved · ${importCoverage?.analyzedFileCount.toLocaleString("en-US")} files`
        : "Not analyzed",
      state:
        importAnalysisAvailable && report.repoGraph.unresolvedLocalStaticReferences > 0
          ? "warning"
          : "neutral",
    },
  ];
}

export function importantWarningCount(report: RepoScanReport) {
  const importCoverage = coverageById(
    report.analyzerCoverage,
    "javascript-typescript-imports",
  );
  const unresolved = ["complete", "partial"].includes(importCoverage?.status ?? "")
    ? report.repoGraph.unresolvedLocalStaticReferences
    : 0;
  const missingDeclaredEntries = report.packageScopes.filter(
    (scope) => scope.declaredEntry && scope.declaredEntryExists === false,
  ).length;

  return (
    nonNegative(report.portability.machineSpecificAbsoluteImports) +
    nonNegative(unresolved) +
    missingDeclaredEntries
  );
}

export function fileContextDistributionFromReport(
  report: RepoScanReport,
  maximumBars = 100,
): FileContextDistribution {
  const files = (report.contextClassification?.files ?? [])
    .filter((file) => isAiEligibleContextPolicy(file.classification.contextPolicy))
    .filter((file) => isSafeRepositoryPath(file.path))
    .map((file) => ({
      path: normalizeRepositoryPath(file.path),
      language: file.language || "Unknown",
      tokens: nonNegative(file.estimatedTokens),
    }))
    .sort((left, right) =>
      right.tokens - left.tokens || compareStableText(left.path, right.path),
    );
  const totalTokens = files.reduce((sum, file) => sum + file.tokens, 0);
  const safeMaximumBars = Math.max(1, Math.floor(maximumBars));
  const bucketed = files.length > safeMaximumBars;
  const points = bucketed
    ? bucketFileContextPoints(files, safeMaximumBars)
    : files.map<FileContextPoint>((file, index) => ({
        key: file.path,
        label: file.path,
        path: file.path,
        language: file.language,
        tokens: file.tokens,
        totalTokens: file.tokens,
        fileCount: 1,
        rankStart: index + 1,
        rankEnd: index + 1,
      }));
  const topFiles = files.slice(0, 5).map<FileContextContributor>((file) => ({
    ...file,
    sharePercent: sharePercent(file.tokens, totalTokens),
  }));
  const largestFileSharePercent = sharePercent(files[0]?.tokens ?? 0, totalTokens);
  const topFiveTokens = files
    .slice(0, 5)
    .reduce((sum, file) => sum + file.tokens, 0);
  const topFiveSharePercent = sharePercent(topFiveTokens, totalTokens);
  const available = files.length > 0;
  const bucketNote = bucketed
    ? ` All files are represented in ${points.length} deterministic rank buckets.`
    : " Each bar represents one file.";

  return {
    available,
    totalFileCount: files.length,
    totalTokens,
    displayedBarCount: points.length,
    bucketed,
    points,
    topFiles,
    largestFileSharePercent,
    topFiveSharePercent,
    accessibleLabel: available
      ? `File context distribution for ${files.length} AI-eligible files, ordered largest to smallest. The largest file contains ${formatTokenCount(files[0]?.tokens)} tokens, ${formatPercent(largestFileSharePercent)} of the file-context total. The top five files contain ${formatPercent(topFiveSharePercent)}.${bucketNote}`
      : "Per-file AI-eligible context distribution is unavailable for this report.",
  };
}

export function contextCompositionFromReport(
  report: RepoScanReport,
): ContextComposition {
  const totals = report.contextClassification?.totals;
  const totalTokens = nonNegative(totals?.totalReadableTokens ?? 0);

  if (!totals || totalTokens === 0) {
    return {
      available: false,
      totalTokens,
      items: [],
      accessibleLabel: "Readable repository context composition is unavailable.",
    };
  }

  const knownItems = [
    compositionItem("eligible", "AI-eligible", totals.defaultAiContextTokens, "eligible"),
    compositionItem(
      "generated",
      "Generated/reference",
      totals.generatedReferenceTokens,
      "generated",
    ),
    compositionItem("lockfile", "Lockfiles", totals.dependencyLockfileTokens, "lockfile"),
    compositionItem("build", "Build output", totals.buildOutputTokens, "build"),
    compositionItem(
      "vendored",
      "Vendored dependencies",
      totals.vendoredDependencyTokens,
      "vendored",
    ),
    compositionItem("runtime", "Runtime data", totals.runtimeDataTokens, "runtime"),
  ];
  const knownTokens = knownItems.reduce((sum, item) => sum + item.tokens, 0);

  if (knownTokens > totalTokens) {
    return {
      available: false,
      totalTokens,
      items: [],
      accessibleLabel: "Readable repository context categories do not reconcile with the reported total.",
    };
  }

  const otherTokens = totalTokens - knownTokens;
  const items = [
    ...knownItems,
    compositionItem("other", "Other readable context", otherTokens, "other"),
  ]
    .filter((item) => item.tokens > 0)
    .map((item) => ({
      ...item,
      percent: (item.tokens / totalTokens) * 100,
    }));
  const description = items
    .map(
      (item) =>
        `${item.label}: ${formatTokenCount(item.tokens)} tokens, ${formatPercent(item.percent)}`,
    )
    .join(". ");

  return {
    available: true,
    totalTokens,
    items,
    accessibleLabel: `All readable repository context: ${formatTokenCount(totalTokens)} tokens. ${description}.`,
  };
}

export function methodologyRows(metrics: ContextMetrics) {
  return [
    ["Total readable repository context", tokenValue(metrics.totalReadableRepositoryTokens)],
    ["AI-eligible repository context", tokenValue(metrics.aiEligibleRepositoryTokens)],
    ["Repository-packet tokens", tokenValue(metrics.repositoryPacketTokens)],
    ["Potentially avoidable context", tokenValue(metrics.potentiallyAvoidableContextTokens)],
    [
      "Potential input-token reduction",
      metrics.potentialInputTokenReductionPercent == null
        ? "Unavailable"
        : `${metrics.potentialInputTokenReductionPercent}%`,
    ],
  ] as const;
}

export function packetActionFeedback(
  action: "copy" | "download",
  result: "success" | "error",
): ActionFeedback {
  if (result === "success") {
    return {
      kind: "success",
      message: action === "copy" ? "Copied" : "Packet downloaded",
    };
  }

  return {
    kind: "error",
    message:
      action === "copy"
        ? "Could not copy the repository packet."
        : "Could not download the repository packet.",
  };
}

export function actionsDisabled(activeAction: PacketAction | null) {
  return activeAction !== null;
}

function bucketFileContextPoints(
  files: Array<{ path: string; language: string; tokens: number }>,
  bucketCount: number,
) {
  return Array.from({ length: bucketCount }, (_, index): FileContextPoint => {
    const start = Math.floor((index * files.length) / bucketCount);
    const end = Math.floor(((index + 1) * files.length) / bucketCount);
    const bucket = files.slice(start, end);
    const bucketTotal = bucket.reduce((sum, file) => sum + file.tokens, 0);
    const rankStart = start + 1;
    const rankEnd = end;

    return {
      key: `ranks-${rankStart}-${rankEnd}`,
      label: rankStart === rankEnd ? `Rank ${rankStart}` : `Ranks ${rankStart}–${rankEnd}`,
      path: null,
      language: null,
      tokens: bucket.length ? Math.round(bucketTotal / bucket.length) : 0,
      totalTokens: bucketTotal,
      fileCount: bucket.length,
      rankStart,
      rankEnd,
    };
  });
}

function compositionItem(
  id: string,
  label: string,
  tokens: number,
  tone: ContextCompositionTone,
): ContextCompositionItem {
  return {
    id,
    label,
    tokens: nonNegative(tokens),
    percent: 0,
    tone,
  };
}

function isAiEligibleContextPolicy(policy: string) {
  return (
    policy === "include_full" ||
    policy === "include_if_task_relevant" ||
    policy === "include_in_default_context"
  );
}

function isSafeRepositoryPath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  return Boolean(
    normalized &&
      !normalized.startsWith("/") &&
      !normalized.startsWith("//") &&
      !normalized.startsWith("file:") &&
      !/^[A-Za-z]:\//.test(normalized) &&
      !normalized.split("/").includes(".."),
  );
}

function normalizeRepositoryPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function compareStableText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sharePercent(tokens: number, totalTokens: number) {
  return totalTokens > 0 ? (tokens / totalTokens) * 100 : 0;
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} percent`;
}

function coverageById(coverage: AnalyzerCoverage[], id: string) {
  return coverage.find((item) => item.analyzerId === id);
}

function tokenValue(value: number | null) {
  return value == null ? "Unavailable" : `${formatTokenCount(value)} tokens`;
}

function optionalNonNegative(value: number | null | undefined) {
  return value == null ? null : nonNegative(value);
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
