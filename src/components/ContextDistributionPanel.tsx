import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { RepoScanReport } from "../types";
import {
  fileContextDistributionFromReport,
  formatTokenCount,
  type FileContextContributor,
  type FileContextDistribution,
} from "./resultsModel";

interface ContextDistributionPanelProps {
  report: RepoScanReport;
}

export function ContextDistributionPanel({ report }: ContextDistributionPanelProps) {
  const distribution = fileContextDistributionFromReport(report);

  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="grid grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] gap-5 p-4 max-[780px]:grid-cols-1">
        <section className="min-w-0" aria-labelledby="file-context-distribution-heading">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="file-context-distribution-heading" className="text-sm font-semibold">
                File context distribution
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {distribution.available
                  ? `${distribution.totalFileCount.toLocaleString("en-US")} AI-eligible files · largest to smallest`
                  : "Per-file context facts are unavailable for this report"}
              </p>
            </div>
            {distribution.available ? (
              <span className="rounded-full border bg-background/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Top 5 contain {formatVisualPercent(distribution.topFiveSharePercent)}
              </span>
            ) : null}
          </div>

          {distribution.available ? (
            <>
              <FileContextSparkBars distribution={distribution} />
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                <span>
                  Largest file: {formatVisualPercent(distribution.largestFileSharePercent)} of eligible file tokens
                </span>
                <span>
                  {distribution.bucketed
                    ? `All files grouped into ${distribution.displayedBarCount} deterministic rank buckets`
                    : "One bar per file"}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-4 grid h-[116px] place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
              Distribution not available
            </div>
          )}
        </section>

        <section className="min-w-0 border-l pl-5 max-[780px]:border-l-0 max-[780px]:border-t max-[780px]:pl-0 max-[780px]:pt-4" aria-labelledby="largest-context-contributors-heading">
          <div>
            <h2 id="largest-context-contributors-heading" className="text-sm font-semibold">
              Largest context contributors
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Exact repository-relative paths and token counts
            </p>
          </div>

          <ContextBarList files={distribution.topFiles} />
        </section>
      </CardContent>
    </Card>
  );
}

function FileContextSparkBars({
  distribution,
}: {
  distribution: FileContextDistribution;
}) {
  return (
    <div
      className="mt-4 h-[116px] w-full border-b border-border/70"
      role="img"
      aria-label={distribution.accessibleLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={distribution.points}
          margin={{ top: 3, right: 1, bottom: 0, left: 1 }}
          barCategoryGap={distribution.displayedBarCount > 50 ? "12%" : "28%"}
        >
          <XAxis dataKey="key" hide />
          <YAxis hide domain={[0, "dataMax"]} />
          <Bar
            dataKey="tokens"
            fill="hsl(var(--primary))"
            fillOpacity={0.88}
            isAnimationActive={false}
            maxBarSize={22}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ContextBarList({ files }: { files: FileContextContributor[] }) {
  if (!files.length) {
    return (
      <div className="mt-4 grid h-[116px] place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
        No eligible files detected
      </div>
    );
  }

  const maximumTokens = Math.max(...files.map((file) => file.tokens), 1);

  return (
    <ol className="mt-3 grid gap-1.5">
      {files.map((file) => (
        <li
          className="relative min-w-0 overflow-hidden rounded-md border bg-background/45 px-2.5 py-2"
          key={file.path}
        >
          <span
            className="absolute inset-y-0 left-0 bg-primary/10"
            style={{ width: `${(file.tokens / maximumTokens) * 100}%` }}
            aria-hidden="true"
          />
          <div className="relative flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-foreground" title={file.path}>
              {file.path}
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary">
              {formatTokenCount(file.tokens)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function formatVisualPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}
