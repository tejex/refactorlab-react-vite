import { Card, CardContent } from "@/components/ui/card";

import { PacketActions } from "./PacketActions";
import { SegmentedContextBar } from "./SegmentedContextBar";
import {
  formatTokenCount,
  type ActionFeedback,
  type ContextMetrics,
  type PacketAction,
} from "./resultsModel";

interface ContextReductionHeroProps {
  actionFeedback: ActionFeedback | null;
  activeAction: PacketAction | null;
  metrics: ContextMetrics;
  packetAvailable: boolean;
  onCopyPacket: () => void;
  onDownloadPacket: () => void;
}

export function ContextReductionHero({
  actionFeedback,
  activeAction,
  metrics,
  packetAvailable,
  onCopyPacket,
  onDownloadPacket,
}: ContextReductionHeroProps) {
  const reduction = metrics.potentialInputTokenReductionPercent;

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="grid gap-4 p-5">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Repository context transformation
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            Your repository, condensed for AI
          </h1>
        </div>

        <div className="grid grid-cols-[minmax(0,max-content)_minmax(96px,1fr)_minmax(0,max-content)] items-start gap-5 max-[680px]:grid-cols-1 max-[680px]:gap-3">
          <TokenValue
            label="AI-eligible context"
            value={metrics.aiEligibleRepositoryTokens}
            fileCount={metrics.aiEligibleFileCount}
            emphasis="neutral"
          />

          <div
            className="mt-1 flex min-w-0 items-center gap-2 max-[680px]:mt-0 max-[680px]:justify-self-center"
            aria-hidden="true"
          >
            <span className="h-px min-w-4 flex-1 bg-border max-[680px]:hidden" />
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-secondary text-lg font-semibold text-muted-foreground shadow-sm max-[680px]:rotate-90">
              →
            </span>
            <span className="h-px min-w-4 flex-1 bg-border max-[680px]:hidden" />
          </div>

          <TokenValue
            label="Repository packet"
            value={metrics.repositoryPacketTokens}
            emphasis="primary"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-5 border-t pt-4 max-[700px]:grid-cols-1">
          <div className="grid gap-3">
            <div>
              <strong className="block text-2xl font-semibold leading-tight text-primary">
                {reduction == null ? "Reduction unavailable" : `${reduction}% potential input-token reduction`}
              </strong>
              <p className="mt-1 text-sm text-muted-foreground">
                {metrics.potentiallyAvoidableContextTokens == null
                  ? "Complete token accounting is not available for this report."
                  : `${formatTokenCount(metrics.potentiallyAvoidableContextTokens)} tokens of potentially avoidable context`}
              </p>
            </div>

            <SegmentedContextBar metrics={metrics} />
          </div>

          <PacketActions
            actionFeedback={actionFeedback}
            activeAction={activeAction}
            packetAvailable={packetAvailable}
            onCopyPacket={onCopyPacket}
            onDownloadPacket={onDownloadPacket}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TokenValue({
  emphasis,
  fileCount,
  label,
  value,
}: {
  emphasis: "neutral" | "primary";
  fileCount?: number | null;
  label: string;
  value: number | null;
}) {
  return (
    <div className="min-w-0">
      <div
        className={
          emphasis === "primary"
            ? "break-words text-[42px] font-semibold leading-none tracking-[-0.04em] text-primary"
            : "break-words text-[36px] font-medium leading-none tracking-[-0.035em] text-foreground"
        }
      >
        {formatTokenCount(value)}
        <span className="ml-2 text-base font-medium tracking-normal text-muted-foreground">
          tokens
        </span>
      </div>
      <p className={emphasis === "primary" ? "mt-2 text-sm font-semibold" : "mt-2 text-sm text-muted-foreground"}>
        {label}
        {fileCount == null ? "" : ` · ${fileCount.toLocaleString("en-US")} files`}
      </p>
    </div>
  );
}
