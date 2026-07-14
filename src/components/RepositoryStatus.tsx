import type { RepoScanReport } from "../types";
import {
  importantWarningCount,
  repositoryStatusFromReport,
  type RepositoryStatusItem,
} from "./resultsModel";

interface RepositoryStatusProps {
  report: RepoScanReport;
}

export function RepositoryStatus({ report }: RepositoryStatusProps) {
  const items = repositoryStatusFromReport(report);
  const warningCount = importantWarningCount(report);
  const unsupportedCoverage = report.analyzerCoverage.filter(
    (coverage) => coverage.status === "unsupported",
  );

  return (
    <section className="rounded-lg border bg-card px-4 py-3" aria-labelledby="repository-status-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="repository-status-heading" className="text-sm font-semibold">
          Repository status
        </h2>
        <p className="text-xs text-muted-foreground">
          Deterministic facts that affect packet usefulness
        </p>
      </div>

      <dl className="grid grid-cols-7 gap-2 max-[900px]:grid-cols-4 max-[620px]:grid-cols-2">
        {items.map((item) => (
          <StatusItem item={item} key={item.label} />
        ))}
      </dl>

      {warningCount > 0 || unsupportedCoverage.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2 text-xs leading-relaxed text-muted-foreground">
          {warningCount > 0 ? (
            <span>
              <strong className="font-semibold text-warning">{warningCount}</strong>{" "}
              important {warningCount === 1 ? "warning" : "warnings"} in supported checks
            </span>
          ) : null}
          {unsupportedCoverage.length > 0 ? (
            <span>
              Unsupported semantic analysis:{" "}
              {unsupportedCoverage
                .flatMap((coverage) => coverage.excludedLanguages)
                .filter((language, index, languages) => languages.indexOf(language) === index)
                .join(", ") || "detected stack"}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StatusItem({ item }: { item: RepositoryStatusItem }) {
  return (
    <div className="min-w-0 rounded-md border bg-background/45 px-2.5 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {item.label}
      </dt>
      <dd
        className={
          item.state === "detected"
            ? "mt-1 break-words text-[13px] font-semibold text-foreground"
            : item.state === "warning"
              ? "mt-1 break-words text-[13px] font-semibold text-warning"
              : "mt-1 break-words text-[13px] font-medium text-muted-foreground"
        }
      >
        {item.value}
      </dd>
    </div>
  );
}
