import type { RepoScanReport } from "../types";
import {
  contextCompositionFromReport,
  formatTokenCount,
  type ContextCompositionTone,
} from "./resultsModel";

interface ContextCompositionBarProps {
  report: RepoScanReport;
}

const toneClasses: Record<ContextCompositionTone, string> = {
  eligible: "bg-[hsl(var(--chart-packet))]",
  generated: "bg-[hsl(var(--chart-generated))]",
  lockfile: "bg-[hsl(var(--chart-lockfile))]",
  build: "bg-[hsl(var(--chart-build))]",
  vendored: "bg-[hsl(var(--chart-vendored))]",
  runtime: "bg-[hsl(var(--chart-runtime))]",
  other: "bg-[hsl(var(--chart-other))]",
};

export function ContextCompositionBar({ report }: ContextCompositionBarProps) {
  const composition = contextCompositionFromReport(report);

  return (
    <section
      className="rounded-lg border bg-card p-4 shadow-sm"
      aria-labelledby="readable-context-composition-heading"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="readable-context-composition-heading" className="text-sm font-semibold">
            All readable repository context
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Why readable context is larger than AI-eligible context
          </p>
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {formatTokenCount(composition.totalTokens)} tokens
        </span>
      </div>

      {composition.available ? (
        <>
          <div className="mt-3 rounded-lg border bg-muted/70 p-[3px] shadow-[inset_0_1px_3px_rgb(0_0_0_/_0.45)]">
            <div
              className="flex h-7 w-full gap-1 overflow-hidden rounded-[5px] bg-background/70"
              role="img"
              aria-label={composition.accessibleLabel}
            >
              {composition.items.map((item) => (
                <span
                  className={`${toneClasses[item.tone]} rounded-[3px] shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.12)]`}
                  key={item.id}
                  style={{
                    flexBasis: 0,
                    flexGrow: item.tokens,
                    flexShrink: 1,
                    minWidth: item.tokens > 0 ? "6px" : undefined,
                  }}
                  title={`${item.label}: ${formatTokenCount(item.tokens)} tokens (${item.percent}%)`}
                />
              ))}
            </div>
          </div>

          <ul className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground max-[650px]:grid-cols-2">
            {composition.items.map((item) => (
              <li className="flex min-w-0 items-center gap-2 rounded-md border bg-secondary/45 px-2.5 py-2" key={item.id}>
                <i className={`h-5 w-1 shrink-0 rounded-full ${toneClasses[item.tone]}`} aria-hidden="true" />
                <span className="min-w-0 truncate" title={item.label}>{item.label}</span>
                <span className="ml-auto shrink-0 font-medium text-foreground">
                  {formatTokenCount(item.tokens)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Context composition is unavailable for this report.
        </div>
      )}
    </section>
  );
}
