import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { RepoScanReport } from "../types";
import { compactNumber, costFocusedDriver, tokenContextMath } from "./costCopy";

interface BreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: RepoScanReport;
}

export function BreakdownDialog({ open, onOpenChange, report }: BreakdownDialogProps) {
  const sourceTokens = report.totals.estimatedSourceTokens;
  const contextReductionPercent = report.scores.compressionOpportunityPercent;
  const math = tokenContextMath(sourceTokens, contextReductionPercent, report.scores.retryRisk);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Cost breakdown">
        <DialogHeader>
          <DialogTitle>Cost Breakdown</DialogTitle>
          <DialogDescription>{report.repoName}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[390px] pr-3">
          <div className="grid grid-cols-2 gap-2 max-[700px]:grid-cols-1">
            <DetailList title="Score Breakdown" items={scoreBreakdownItems(report)} />
            <DetailList title="Token Calculations" items={tokenFormulaItems(sourceTokens, contextReductionPercent, math.compactContextTokens, math.potentialTokensSaved)} />
            <DetailList title="Retry Context Range" items={retryItems(math)} />
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
    "Context Waste: " + report.scores.compressionOpportunityPercent + "%",
    "Verification debt: " + report.scores.verificationDebt + "/10",
    "Ambiguity risk: " + report.scores.ambiguityRisk + "/10",
    "Blast radius: " + report.scores.blastRadius + "/10",
    "Retry Burn Risk: " + report.scores.retryRisk,
    "Privacy Risk: " + report.scores.privacyRisk,
    "AI Cost Risk formula: 35% context + 25% verification + 15% ambiguity + 15% blast radius + 10% privacy",
  ];
}

function tokenFormulaItems(sourceTokens: number, contextReductionPercent: number, compactTokens: number, savedTokens: number) {
  return [
    "sourceTokens = " + sourceTokens.toLocaleString(),
    "contextReductionPercent = " + contextReductionPercent + "%",
    "potentialTokensSaved = sourceTokens * contextReductionPercent / 100 = " + savedTokens.toLocaleString(),
    "compactContextTokens = sourceTokens - potentialTokensSaved = " + compactTokens.toLocaleString(),
  ];
}

function retryItems(math: ReturnType<typeof tokenContextMath>) {
  return [
    "Retry pass range: " + math.retryMinPasses + "-" + math.retryMaxPasses,
    "potentialAvoidableContextMin = " + math.retryContextTokensMin.toLocaleString() + " tokens",
    "potentialAvoidableContextMax = " + math.retryContextTokensMax.toLocaleString() + " tokens",
    "Token-only estimate for V1.",
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
