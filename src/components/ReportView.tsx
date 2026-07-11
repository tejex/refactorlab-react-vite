import { useState } from "react";
import { BreakdownDialog } from "./BreakdownDialog";
import { CompactHeader } from "./CompactHeader";
import { FooterActions } from "./FooterActions";
import { HeroCostVerdict } from "./HeroCostVerdict";
import { RiskSummaryRow } from "./RiskSummaryRow";
import { tokenContextMathFromReport } from "./costCopy";
import type { RepoScanReport } from "../types";

interface ReportViewProps {
  report: RepoScanReport;
  exportMessage: string | null;
  onChooseAnother: () => void;
  onExport: () => void;
  onRescan: () => void;
}

export function ReportView({ exportMessage, onChooseAnother, onExport, onRescan, report }: ReportViewProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const math = tokenContextMathFromReport(report);

  return (
    <section className="mx-auto grid h-screen w-[min(810px,calc(100vw-20px))] content-center gap-2 p-2 max-[780px]:h-auto max-[780px]:content-start">
      <CompactHeader report={report} onExport={onExport} onRescan={onRescan} />

      <HeroCostVerdict
        compactContextTokens={math.compactContextTokens}
        contextReductionPercent={math.contextReductionPercent}
        potentialTokensSaved={math.potentialTokensSaved}
        sourceTokens={math.sourceTokens}
      />

      <RiskSummaryRow
        aiCostRisk={report.scores.aiExpenseScore}
        privacyRisk={report.scores.privacyRisk}
        retryRisk={report.scores.retryRisk}
      />
      
      <FooterActions
        exportMessage={exportMessage}
        onChooseAnother={onChooseAnother}
        onViewDetails={() => setBreakdownOpen(true)}
      />
     

      <BreakdownDialog open={breakdownOpen} report={report} onOpenChange={setBreakdownOpen} />
    </section>
  );
}
