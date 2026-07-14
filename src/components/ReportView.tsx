import { lazy, Suspense } from "react";
import type { RepoScanReport } from "../types";
import { CompactHeader } from "./CompactHeader";
import { ContextCompositionBar } from "./ContextCompositionBar";
import { ContextMethodologyDisclosure } from "./ContextMethodologyDisclosure";
import { ContextReductionHero } from "./HeroCostVerdict";
import { RepositoryStatus } from "./RepositoryStatus";
import {
  actionsDisabled,
  contextMetricsFromReport,
  type ActionFeedback,
  type PacketAction,
} from "./resultsModel";

const ContextDistributionPanel = lazy(() =>
  import("./ContextDistributionPanel").then((module) => ({
    default: module.ContextDistributionPanel,
  })),
);

interface ReportViewProps {
  report: RepoScanReport;
  activeAction: PacketAction | null;
  actionFeedback: ActionFeedback | null;
  onChooseAnother: () => void;
  onCopyPacket: () => void;
  onDownloadPacket: () => void;
  onRescan: () => void;
}

export function ReportView({
  actionFeedback,
  activeAction,
  onChooseAnother,
  onCopyPacket,
  onDownloadPacket,
  onRescan,
  report,
}: ReportViewProps) {
  const metrics = contextMetricsFromReport(report);

  return (
    <section className="h-screen overflow-y-auto px-4 py-3">
      <div className="mx-auto grid w-full max-w-[1040px] gap-2.5">
        <CompactHeader
          busy={actionsDisabled(activeAction)}
          report={report}
          onChooseAnother={onChooseAnother}
          onRescan={onRescan}
        />

        <ContextReductionHero
          actionFeedback={actionFeedback}
          activeAction={activeAction}
          metrics={metrics}
          packetAvailable={Boolean(report.repoDigest)}
          onCopyPacket={onCopyPacket}
          onDownloadPacket={onDownloadPacket}
        />

        <Suspense
          fallback={
            <section className="grid min-h-[190px] place-items-center rounded-lg border bg-card text-sm text-muted-foreground" aria-live="polite">
              Preparing file context distribution…
            </section>
          }
        >
          <ContextDistributionPanel report={report} />
        </Suspense>

        <RepositoryStatus report={report} />

        <ContextCompositionBar report={report} />

        <ContextMethodologyDisclosure metrics={metrics} report={report} />
      </div>
    </section>
  );
}
