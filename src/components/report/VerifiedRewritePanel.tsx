import type { ProjectReport } from "../../scanner/types";
import type { VerifiedRewriteArchive } from "../../scanner/verifiedRewriteEngine";
import { Metric } from "./Metric";

interface VerifiedRewritePanelProps {
  report: ProjectReport;
  isAvailable: boolean;
  isChecking: boolean;
  isRewriting: boolean;
  result: VerifiedRewriteArchive | null;
  onRun?: () => void;
  onDownload?: () => void;
}

export function VerifiedRewritePanel({ report, isAvailable, isChecking, isRewriting, result, onRun, onDownload }: VerifiedRewritePanelProps) {
  const safeRewrites = report.inlineAssetPlan?.guaranteedSafeChanges.length ?? 0;
  const reviewCount = (report.inlineAssetPlan?.blocks ?? []).filter((block) => block.safety !== "High").length;
  const isBusy = isChecking || isRewriting;
  const canRun = Boolean(onRun) && isAvailable && !isBusy && safeRewrites > 0;
  const canDownload = Boolean(onDownload) && isAvailable && !isBusy && safeRewrites > 0;

  return (
    <div className="verified-rewrite-panel">
      <div className="metric-grid">
        <Metric label="Verified rewrites" value={safeRewrites.toLocaleString()} />
        <Metric label="Needs review" value={reviewCount.toLocaleString()} />
      </div>

      <div className="rewrite-actions">
        <button className="rewrite-run-button" type="button" disabled={!canRun} onClick={onRun}>
          {isChecking ? "running rewrite..." : "run rewrite check"}
        </button>
        <button className="link-button" type="button" disabled={!canDownload} onClick={onDownload}>
          {isRewriting ? "building verified rewrite..." : "download verified rewrite"}
        </button>
      </div>

      {result ? <RewriteRunResult result={result} /> : null}
    </div>
  );
}

function RewriteRunResult({ result }: { result: VerifiedRewriteArchive }) {
  const applied = result.manifest.applied;
  const rejected = result.manifest.rejected;
  const visibleApplied = applied.slice(0, 6);

  return (
    <div className="rewrite-run-result">
      <div className="metric-grid">
        <Metric label="Applied" value={applied.length.toLocaleString()} />
        <Metric label="Rejected" value={rejected.length.toLocaleString()} />
        <Metric label="Output files" value={result.files.length.toLocaleString()} />
        <Metric label="Excluded temp files" value={result.manifest.excludedOriginalFiles.length.toLocaleString()} />
      </div>

      <div className="rewrite-change-list">
        {visibleApplied.map((change) => (
          <div className="rewrite-change-row" key={`${change.sourceFile}-${change.targetFile}-${change.lines}`}>
            <strong>{change.targetFile}</strong>
            <span>
              {change.sourceFile} L{change.lines}
            </span>
          </div>
        ))}
        {applied.length > visibleApplied.length ? (
          <div className="rewrite-change-row">
            <strong>+{(applied.length - visibleApplied.length).toLocaleString()} more</strong>
            <span>Included in the generated ZIP</span>
          </div>
        ) : null}
        {rejected.length ? (
          <div className="rewrite-change-row rewrite-change-warning">
            <strong>{rejected.length.toLocaleString()} rejected</strong>
            <span>{rejected[0]?.reason ?? "Review required"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
