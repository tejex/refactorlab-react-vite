import type { RepoScanReport } from "../types";
import {
  formatTokenCount,
  methodologyRows,
  type ContextMetrics,
} from "./resultsModel";

interface ContextMethodologyDisclosureProps {
  metrics: ContextMetrics;
  report: RepoScanReport;
}

export function ContextMethodologyDisclosure({
  metrics,
  report,
}: ContextMethodologyDisclosureProps) {
  const tokenizer = [metrics.tokenizer, metrics.method, metrics.encoding]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="group rounded-lg border bg-card px-4 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>Context details</span>
        <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">
          ↓
        </span>
      </summary>

      <div className="mt-3 border-t pt-3">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)] gap-5 max-[720px]:grid-cols-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px] max-[520px]:grid-cols-1">
            {methodologyRows(metrics).map(([label, value]) => (
              <div className="flex items-baseline justify-between gap-3" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="shrink-0 font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid content-start gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
            <p>Tokenizer: {tokenizer || "Unavailable"}{metrics.fallbackUsed ? " · shared fallback used" : ""}</p>
            <p>
              AI-eligible files: {formatTokenCount(metrics.aiEligibleFileCount)} · Readable files:{" "}
              {formatTokenCount(metrics.totalReadableFileCount)}
            </p>
            <p>
              The estimate compares the final packet with context selected by Fixer’s deterministic file classifier.
            </p>
            <p>Actual external-agent usage may differ by model, prompt, tools, cache, and task.</p>
            {!metrics.accountingAvailable ? (
              <p className="text-foreground">
                Exact unified accounting is unavailable for this older or incomplete report.
              </p>
            ) : null}
            {report.analyzerCoverage.some((coverage) => coverage.status === "unsupported") ? (
              <p className="text-foreground">
                Unsupported capabilities are labeled as not analyzed rather than reported as zero.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}
