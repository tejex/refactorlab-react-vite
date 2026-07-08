import type { RepoScanReport } from "../types";
import { compactNumber, costFocusedDriver, tokenCalculation } from "./costCopy";

interface DetailsModalProps {
  report: RepoScanReport;
  onClose: () => void;
}

export function DetailsModal({ report, onClose }: DetailsModalProps) {
  const sourceTokens = report.totals.estimatedSourceTokens;
  const contextWaste = report.scores.compressionOpportunityPercent;
  const { estimatedCompactRepoMapTokens, potentialTokensSaved } = tokenCalculation(sourceTokens, contextWaste);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="details-modal" role="dialog" aria-modal="true" aria-label="Report details" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2>Report Details</h2>
            <p>{report.repoName}</p>
          </div>
          <button type="button" className="secondary-action icon-action" onClick={onClose} aria-label="Close details">x</button>
        </header>

        <div className="details-grid">
          <DetailList title="Score Breakdown" items={scoreBreakdownItems(report)} />
          <DetailList title="Token Calculation" items={tokenCalculationItems(sourceTokens, contextWaste, estimatedCompactRepoMapTokens, potentialTokensSaved)} />
          <DetailList title="Top Token-Heavy Files" items={report.expensiveFiles.slice(0, 8).map((file) => `${file.path}: ${compactNumber(file.estimatedTokens)} tokens, ${file.lineCount.toLocaleString()} lines`)} />
          <DetailList title="Verification Signals" items={verificationItems(report)} />
          <DetailList title="Privacy Signals" items={privacyItems(report)} />
          <DetailList title="Ignored Folders" items={ignoredItems(report)} />
          <DetailList title="Full Cost Driver List" items={report.topCostDrivers.map((driver) => {
            const display = costFocusedDriver(driver, report.totals);
            return `${display.severity.toUpperCase()} - ${display.title}: ${display.explanation}${display.affectedLabel ? ` (${display.affectedLabel})` : ""}`;
          })} />
        </div>
      </section>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="detail-list">
      <h3>{title}</h3>
      <div>
        {items.length ? items.map((item) => <p key={item} title={item}>{item}</p>) : <p>None detected</p>}
      </div>
    </section>
  );
}

function scoreBreakdownItems(report: RepoScanReport) {
  return [
    `AI Cost Risk: ${report.scores.aiExpenseScore}/10 weighted from context, verification, ambiguity, blast radius, and privacy`,
    `AI-Readiness: ${report.scores.aiReadinessScore}/100`,
    `Context burden: ${report.scores.contextBurden}/10`,
    `Verification debt: ${report.scores.verificationDebt}/10`,
    `Ambiguity risk: ${report.scores.ambiguityRisk}/10`,
    `Blast radius: ${report.scores.blastRadius}/10`,
    `Retry burn risk: ${report.scores.retryRisk}`,
    `Privacy risk: ${report.scores.privacyRisk}`,
  ];
}

function tokenCalculationItems(sourceTokens: number, contextWaste: number, compactTokens: number, savedTokens: number) {
  return [
    `Tokens at risk: ${sourceTokens.toLocaleString()} estimated source tokens`,
    `Context waste: ${contextWaste}% potential broad-context waste`,
    `Estimated compact repo summary tokens: ${compactTokens.toLocaleString()}`,
    `Potential tokens saved: ${savedTokens.toLocaleString()}`,
    "Formula: source tokens - estimated compact repo summary tokens",
  ];
}

function verificationItems(report: RepoScanReport) {
  return [
    report.verification.hasBuildScript ? `Build: ${report.verification.buildScripts.join(", ")}` : "Build: missing",
    report.verification.hasTestScript ? `Test: ${report.verification.testScripts.join(", ")}` : "Test: missing",
    report.verification.hasTypecheckScript ? `Typecheck: ${report.verification.typecheckScripts.join(", ")}` : "Typecheck: missing",
    report.verification.hasLintScript ? `Lint: ${report.verification.lintScripts.join(", ")}` : "Lint: missing",
    report.verification.hasCiConfig ? "CI config detected" : "CI config missing",
  ];
}

function privacyItems(report: RepoScanReport) {
  return [
    `${report.privacy.envFiles.length} .env-style files`,
    `${report.privacy.secretCandidateCount} secret-like assignments`,
    `${report.privacy.privateUrlCount} private/internal URL signals`,
    ...report.privacy.secretCandidateFiles.map((file) => `Secret-like signal: ${file}`),
    ...report.privacy.envFiles.map((file) => `.env-style file: ${file}`),
    ...report.privacy.findings,
  ];
}

function ignoredItems(report: RepoScanReport) {
  return [
    `${report.totals.ignoredFiles.toLocaleString()} ignored files/folders counted`,
    ...report.ignoredPaths.slice(0, 24),
  ];
}
