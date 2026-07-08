import { useState } from "react";
import { CompactCostDrivers } from "./CompactCostDrivers";
import { CompactHeader } from "./CompactHeader";
import { DetailsModal } from "./DetailsModal";
import { FooterActions } from "./FooterActions";
import { MetricCard } from "./MetricCard";
import { MiniMetricCard } from "./MiniMetricCard";
import { compactNumber, tokenCalculation } from "./costCopy";
import type { RepoScanReport } from "../types";

interface ReportViewProps {
  report: RepoScanReport;
  exportMessage: string | null;
  onChooseAnother: () => void;
  onExport: () => void;
  onRescan: () => void;
}

export function ReportView({ report, exportMessage, onChooseAnother, onExport, onRescan }: ReportViewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sourceTokens = report.totals.estimatedSourceTokens;
  const contextWaste = report.scores.compressionOpportunityPercent;
  const { potentialTokensSaved } = tokenCalculation(sourceTokens, contextWaste);

  return (
    <section className="report-shell">
      <CompactHeader report={report} onExport={onExport} onRescan={onRescan} />

      <section className="primary-metrics" aria-label="Primary AI coding cost metrics">
        <MetricCard
          label="AI Cost Risk"
          value={`${oneDecimal(report.scores.aiExpenseScore)}/10`}
          subtitle="Likely expensive for AI agents"
          explanation="Weighted score from context burden, verification debt, ambiguity, blast radius, and privacy signals."
          tone={expenseTone(report.scores.aiExpenseScore)}
        />
        <MetricCard
          label="Tokens at Risk"
          value={compactNumber(sourceTokens)}
          subtitle="Estimated source context"
          explanation="Estimated source tokens from scanned text files."
        />
        <MetricCard
          label="Potential Tokens Saved"
          value={compactNumber(potentialTokensSaved)}
          subtitle="Possible tighter-context savings"
          explanation="Estimated source tokens minus estimated compact repo summary tokens."
          tone={contextWaste >= 50 ? "good" : "neutral"}
        />
      </section>

      <section className="secondary-metrics" aria-label="Secondary AI coding cost metrics">
        <MiniMetricCard
          label="Context Waste"
          value={`${contextWaste}%`}
          subtitle="Potential broad-context waste"
          explanation="Potential reduction compared with broad repo context."
          tone={contextWaste >= 50 ? "warn" : "neutral"}
        />
        <MiniMetricCard
          label="Retry Burn Risk"
          value={report.scores.retryRisk}
          subtitle="Failed attempts multiply spend"
          explanation="Based on missing tests, typecheck, build, CI, and overall repo risk."
          tone={riskTone(report.scores.retryRisk)}
        />
        <MiniMetricCard
          label="Privacy Risk"
          value={report.scores.privacyRisk}
          subtitle="Review before sharing context"
          explanation="Based on .env files, secret-like strings, and private/internal URL signals."
          tone={riskTone(report.scores.privacyRisk)}
        />
      </section>

      <CompactCostDrivers drivers={report.topCostDrivers} totals={report.totals} />

      <FooterActions
        exportMessage={exportMessage}
        onChooseAnother={onChooseAnother}
        onViewDetails={() => setDetailsOpen(true)}
      />

      {detailsOpen ? <DetailsModal report={report} onClose={() => setDetailsOpen(false)} /> : null}
    </section>
  );
}

function oneDecimal(value: number) {
  return value.toFixed(1).replace(".0", "");
}

function expenseTone(score: number) {
  if (score >= 7) return "bad";
  if (score >= 4) return "warn";
  return "good";
}

function riskTone(risk: "Low" | "Medium" | "High") {
  if (risk === "High") return "bad";
  if (risk === "Medium") return "warn";
  return "good";
}
