import { segmentedContextModel, type ContextMetrics } from "./resultsModel";

interface SegmentedContextBarProps {
  metrics: ContextMetrics;
}

export function SegmentedContextBar({ metrics }: SegmentedContextBarProps) {
  const model = segmentedContextModel(metrics);

  return (
    <div className="grid gap-2.5">
      <div
        className="relative h-7 overflow-hidden rounded-lg border border-primary/25 bg-muted p-[3px] shadow-[inset_0_1px_3px_rgb(0_0_0_/_0.45)]"
        role="img"
        aria-label={model.accessibleLabel}
      >
        <div className="relative h-full overflow-hidden rounded-[4px] bg-background/70">
          {model.available ? (
            <>
              <span
                className="absolute inset-y-0 left-0 grid place-items-center bg-[hsl(var(--chart-avoidable))] text-xs font-semibold text-white"
                style={{ width: `${model.avoidableWidthPercent}%` }}
              >
                {model.avoidableWidthPercent >= 8 ? `${model.avoidablePercent}%` : null}
              </span>
              <span
                className="absolute inset-y-0 right-0 grid place-items-center border-l-[3px] border-background bg-[hsl(var(--chart-packet))] text-xs font-bold text-primary-foreground shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.2)]"
                style={{
                  minWidth: model.showPacketMarker ? "10px" : undefined,
                  width: `${model.packetWidthPercent}%`,
                }}
              >
                {model.packetWidthPercent >= 4 && model.packetPercent != null
                  ? `${model.packetPercent}%`
                  : null}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[13px] text-muted-foreground max-[520px]:grid-cols-1" aria-hidden="true">
        <span className="inline-flex items-center gap-2 rounded-md border bg-secondary/45 px-2.5 py-1.5">
          <i className="h-3 w-1 shrink-0 rounded-full bg-[hsl(var(--chart-avoidable))]" />
          <span>Potentially avoidable context</span>
          <strong className="ml-auto text-foreground">
            {model.available ? `${model.avoidablePercent}%` : "Unavailable"}
          </strong>
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border bg-secondary/45 px-2.5 py-1.5">
          <i className="h-3 w-1 shrink-0 rounded-full bg-[hsl(var(--chart-packet))]" />
          <span>Repository packet</span>
          <strong className="ml-auto text-foreground">
            {model.packetPercent == null ? "Not comparable" : `${model.packetPercent}%`}
          </strong>
        </span>
      </div>
    </div>
  );
}
