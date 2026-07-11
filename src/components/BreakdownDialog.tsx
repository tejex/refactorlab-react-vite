import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RepoScanReport } from "../types";
import { compactNumber, costFocusedDriver, tokenContextMathFromReport, type TokenContextMath } from "./costCopy";

interface BreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: RepoScanReport;
}

export function BreakdownDialog({ open, onOpenChange, report }: BreakdownDialogProps) {
  const math = tokenContextMathFromReport(report);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Fixer report">
        <DialogHeader>
          <DialogTitle>Report</DialogTitle>
          <DialogDescription>{report.repoName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[390px] pr-3">
          <div className="grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
            <DetailList title="Score Breakdown" items={scoreBreakdownItems(report)} />
            <DetailList title="Token Calculations" items={tokenFormulaItems(math)} />
            <DetailList title="Repository Packet" items={digestItems(report, math)} />
            <DetailList title="Context Classification" items={classificationItems(report)} />
            <DetailList title="Summary Buckets" items={summaryBucketItems(report)} />
            <DetailList title="Classification Evidence" items={classificationEvidenceItems(report)} />
            <DetailList title="Repo Graph Evidence" items={repoGraphItems(report)} />
            <DetailList title="Expensive Files" items={report.expensiveFiles.slice(0, 8).map((file) => file.path + ": " + compactNumber(file.estimatedTokens) + " tokens, " + file.lineCount.toLocaleString() + " lines")} />
            <DetailList title="Verification Signals" items={verificationItems(report)} />
            <DetailList title="Privacy Signals" items={privacyItems(report)} />
            <DetailList title="Ignored Folders" items={ignoredItems(report)} />
            <section className="rounded-lg border bg-background/55 p-3">
              <h3 className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Full Cost Leak List</h3>
              <div className="grid gap-2">
                {report.topCostDrivers.map((driver) => {
                  const display = costFocusedDriver(driver, report.totals);
                  return (
                    <div className="grid gap-1 rounded-md border bg-card p-2" key={driver.title + driver.explanation}>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="truncate text-xs font-semibold">{display.title}</strong>
                        <Badge variant={display.severity}>{display.severity}</Badge>
                      </div>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">{display.explanation}</p>
                      {display.affectedLabel ? <p className="text-[11px] text-muted-foreground">{display.affectedLabel}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="min-w-0 rounded-lg border bg-background/55 p-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">{title}</h3>
      <div className="grid gap-1">
        {items.length ? items.map((item) => <p className="truncate text-[11px] leading-relaxed text-foreground/85" key={item} title={item}>{item}</p>) : <p className="text-[11px] text-muted-foreground">None detected</p>}
      </div>
    </section>
  );
}

function scoreBreakdownItems(report: RepoScanReport) {
  return [
    "AI Cost Risk: " + report.scores.aiExpenseScore + "/10",
    "AI-Readiness: " + report.scores.aiReadinessScore + "/100",
    "Context burden: " + report.scores.contextBurden + "/10",
    "Potential input-token reduction: " + report.scores.compressionOpportunityPercent + "%",
    "Verification debt: " + report.scores.verificationDebt + "/10",
    "Ambiguity risk: " + report.scores.ambiguityRisk + "/10",
    "Blast radius: " + report.scores.blastRadius + "/10",
    "Retry Burn Risk: " + report.scores.retryRisk,
    "Privacy Risk: " + report.scores.privacyRisk,
    "AI Cost Risk formula: 35% context + 25% verification + 15% ambiguity + 15% blast radius + 10% privacy",
  ];
}

function tokenFormulaItems(math: TokenContextMath) {
  return [
    "AI-eligible repository context = " + math.aiEligibleRepositoryTokens.toLocaleString() + " tokens",
    "Repository-packet tokens = " + math.repositoryPacketTokens.toLocaleString(),
    "Potentially avoidable context = AI-eligible repository context - repository packet = " + math.potentiallyAvoidableContextTokens.toLocaleString() + " tokens",
    "Potential input-token reduction = " + math.potentialInputTokenReductionPercent + "%",
  ];
}


function digestItems(report: RepoScanReport, math: TokenContextMath) {
  const tokenization = report.tokenization;
  const digest = report.repoDigest;
  const tokenizationLabel = tokenization
    ? `${tokenization.tokenizer} / ${tokenization.method}${tokenization.encoding ? ` / ${tokenization.encoding}` : ""}${tokenization.fallbackUsed ? " / fallback" : ""}`
    : "Not available";

  const items = [
    "Repository-packet tokens: " + compactNumber(digest?.packetTokens ?? math.repositoryPacketTokens),
    "AI-eligible repository context: " + compactNumber(math.aiEligibleRepositoryTokens),
    "Potentially avoidable context: " + compactNumber(math.potentiallyAvoidableContextTokens),
    "Tokenization: " + tokenizationLabel,
  ];

  if (!digest) {
    return [...items, "Repository packet is not available for this older report."];
  }

  return [
    ...items,
    ...digest.sections.map((section) =>
      `${section.title} — ${compactNumber(section.estimatedTokens)} tokens / ${compactNumber(section.budgetTokens)} budget`,
    ),
  ];
}


function classificationItems(report: RepoScanReport) {
  const totals = report.contextClassification?.totals;

  if (!totals) {
    return ["Context classification is not available for this older report."];
  }

  return [
    "AI-eligible repository context: " + compactNumber(totals.defaultAiContextTokens) + " tokens / " + totals.defaultAiContextFiles.toLocaleString() + " files",
    "Total readable text: " + compactNumber(totals.totalReadableTokens) + " tokens",
    "Authored source: " + compactNumber(totals.authoredSourceTokens) + " tokens / " + totals.authoredSourceFiles.toLocaleString() + " files",
    "Source-of-truth config: " + compactNumber(totals.sourceOfTruthConfigTokens) + " tokens / " + totals.sourceOfTruthConfigFiles.toLocaleString() + " files",
    "Generated/reference files: " + compactNumber(totals.generatedReferenceTokens) + " tokens / " + totals.generatedReferenceFiles.toLocaleString() + " files",
    "Dependency lock files: " + compactNumber(totals.dependencyLockfileTokens) + " tokens / " + totals.dependencyLockfileFiles.toLocaleString() + " files",
    "Runtime data: " + compactNumber(totals.runtimeDataTokens) + " tokens / " + totals.runtimeDataFiles.toLocaleString() + " files",
    "Unknown source: " + compactNumber(totals.unknownSourceTokens) + " tokens / " + totals.unknownSourceFiles.toLocaleString() + " files",
  ];
}

function summaryBucketItems(report: RepoScanReport) {
  const summaries = report.contextClassification?.summaries ?? [];

  if (!summaries.length) {
    return ["No summary buckets are available for this report."];
  }

  return summaries.flatMap((summary) => {
    const sourcePaths = summary.sourcePaths.length
      ? "source-of-truth: " + summary.sourcePaths.join(", ")
      : "source-of-truth: none detected";
    const files = summary.topFiles
      .slice(0, 3)
      .map((file) => file.path + " (" + compactNumber(file.estimatedTokens) + ")");

    return [
      summary.title + ": " + compactNumber(summary.totalTokens) + " tokens / " + summary.fileCount.toLocaleString() + " files / " + summary.contextPolicy,
      sourcePaths,
      ...summary.details,
      ...files,
    ];
  });
}

function classificationEvidenceItems(report: RepoScanReport) {
  const files = report.contextClassification?.files ?? [];

  if (!files.length) {
    return ["No classifier evidence is available for this older report."];
  }

  return files
    .filter((file) => !isDefaultContextPolicy(file.classification.contextPolicy))
    .sort((a, b) => b.estimatedTokens - a.estimatedTokens)
    .slice(0, 12)
    .map((file) =>
      file.path + ": " + file.classification.role + " / " + file.classification.contextPolicy + " / " + Math.round(file.classification.confidence * 100) + "% confidence / " + file.classification.reasons.join(", "),
    );
}

function isDefaultContextPolicy(policy: string) {
  return policy === "include_full" || policy === "include_if_task_relevant" || policy === "include_in_default_context";
}

function repoGraphItems(report: RepoScanReport) {
  return [
    "Total imports: " + report.repoGraph.totalImports.toLocaleString(),
    "Relative imports: " + report.repoGraph.relativeImports.toLocaleString(),
    "External imports: " + report.repoGraph.externalImports.toLocaleString(),
    "Resolved imports: " + report.repoGraph.resolvedImports.toLocaleString(),
    "Unresolved imports: " + report.repoGraph.unresolvedImports.toLocaleString(),
    "Circular import files: " + report.repoGraph.circularImportFiles.toLocaleString(),
    "Max fan-in: " + report.repoGraph.maxFanIn.toLocaleString(),
    "Max fan-out: " + report.repoGraph.maxFanOut.toLocaleString(),
    "Sensitive module refs: " + report.repoGraph.sensitiveModuleRefs.toLocaleString(),
    ...report.repoGraph.hubFiles.map((file) =>
      file.path + ": fan-in " + file.fanIn + ", fan-out " + file.fanOut + ", " + file.signals.join(", ")
    ),
  ];
}

function verificationItems(report: RepoScanReport) {
  return [
    report.verification.hasBuildScript ? "Build: " + report.verification.buildScripts.join(", ") : "Build: missing",
    report.verification.hasTestScript ? "Test: " + report.verification.testScripts.join(", ") : "Test: missing",
    report.verification.hasTypecheckScript ? "Typecheck: " + report.verification.typecheckScripts.join(", ") : "Typecheck: missing",
    report.verification.hasLintScript ? "Lint: " + report.verification.lintScripts.join(", ") : "Lint: missing",
    report.verification.hasCiConfig ? "CI config detected" : "CI config missing",
  ];
}

function privacyItems(report: RepoScanReport) {
  return [
    report.privacy.envFiles.length + " .env-style files",
    report.privacy.secretCandidateCount + " secret-like assignments",
    report.privacy.privateUrlCount + " private/internal URL signals",
    ...report.privacy.secretCandidateFiles.map((file) => "Secret-like signal: " + file),
    ...report.privacy.envFiles.map((file) => ".env-style file: " + file),
    ...report.privacy.findings,
  ];
}

function ignoredItems(report: RepoScanReport) {
  return [
    report.totals.ignoredFiles.toLocaleString() + " ignored files/folders counted",
    ...report.ignoredPaths.slice(0, 24),
  ];
}
