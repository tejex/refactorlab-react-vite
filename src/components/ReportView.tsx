import { CompactHeader } from "./CompactHeader";
import { HeroCostVerdict } from "./HeroCostVerdict";
import { RiskSummaryRow } from "./RiskSummaryRow";
import { tokenContextMath } from "./costCopy";
import type { RepoScanReport } from "../types";

interface ReportViewProps {
  report: RepoScanReport;
  exportMessage: string | null;
  onChooseAnother: () => void;
  onExport: () => void;
  onRescan: () => void;
}

export function ReportView({ report, onExport, onRescan }: ReportViewProps) {
  const sourceTokens = report.totals.estimatedSourceTokens;
  const contextReductionPercent = report.scores.compressionOpportunityPercent;
  const math = tokenContextMath(sourceTokens, contextReductionPercent, report.scores.retryRisk);

  return (
    <section className="mx-auto grid h-screen w-[min(810px,calc(100vw-20px))] content-center gap-2 p-2 max-[780px]:h-auto max-[780px]:content-start">
      <CompactHeader report={report} onExport={onExport} onRescan={onRescan} />

      <HeroCostVerdict
        compactContextTokens={math.compactContextTokens}
        contextReductionPercent={contextReductionPercent}
        potentialTokensSaved={math.potentialTokensSaved}
        sourceTokens={sourceTokens}
      />

      <RiskSummaryRow
        aiCostRisk={report.scores.aiExpenseScore}
        privacyRisk={report.scores.privacyRisk}
        retryRisk={report.scores.retryRisk}
      />
    </section>
  );
}
