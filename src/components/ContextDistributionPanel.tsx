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

const maximumDistributionBars = 20;

export function ContextDistributionPanel({ report }: ContextDistributionPanelProps) {
  const distribution = fileContextDistributionFromReport(
    report,
    maximumDistributionBars,
  );

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
                  ? `${distribution.totalFileCount.toLocaleString("en-US")} AI-eligible files · summarized largest to smallest`
                  : "Per-file context facts are unavailable for this report"}
              </p>
            </div>
            {distribution.available ? (
              <span className="rounded-full border bg-background/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Top 5 · {formatVisualPercent(distribution.topFiveSharePercent)}
              </span>
            ) : null}
          </div>

          {distribution.available ? (
            <>
              <FileContextSparkBars distribution={distribution} />
              <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                <span>
                  Largest file · {formatVisualPercent(distribution.largestFileSharePercent)}
                </span>
                <span>
                  {distribution.bucketed
                    ? `${distribution.displayedBarCount} size groups · all files included`
                    : `${distribution.displayedBarCount} files shown`}
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
              Filenames and exact token counts
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
  const maximumTokens = Math.max(
    ...distribution.points.map((point) => point.tokens),
    1,
  );

  return (
    <div
      className="mt-4 rounded-md border bg-background/35 px-3 pb-2 pt-3"
      role="img"
      aria-label={distribution.accessibleLabel}
    >
      <div className="flex h-[88px] items-end gap-1.5 border-b border-border/70 px-0.5">
        {distribution.points.map((point) => (
          <span
            className="min-w-0 flex-1 rounded-t-[3px] bg-primary/75"
            key={point.key}
            style={{
              height: `${Math.max(5, (point.tokens / maximumTokens) * 100)}%`,
            }}
            title={`${point.label}: ${formatTokenCount(point.tokens)}${distribution.bucketed ? " average" : ""} tokens`}
          />
        ))}
      </div>
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
            <span className="min-w-0 truncate text-xs text-foreground" title={file.displayName}>
              {file.displayName}
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
