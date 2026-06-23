import type { AiContextPackBuild } from "../../scanner/aiContextPack";
import type { MigrationPlanPackBuild } from "../../scanner/migrationPlanPack";
import { groupedProjectBlockersForReport } from "../../scanner/projectBlockers";
import type { RouteStarterPackBuild } from "../../scanner/routeStarterPack";
import type { ProjectReport } from "../../scanner/types";
import type { VerifiedRewriteArchive } from "../../scanner/verifiedRewriteEngine";

interface ArtifactSummaryPanelProps {
  report: ProjectReport;
  rewriteResult: VerifiedRewriteArchive | null;
  contextPackResult: AiContextPackBuild | null;
  migrationPlanResult: MigrationPlanPackBuild | null;
  routeStarterResult: RouteStarterPackBuild | null;
}

export function ArtifactSummaryPanel({ report, rewriteResult, contextPackResult, migrationPlanResult, routeStarterResult }: ArtifactSummaryPanelProps) {
  if (!rewriteResult && !contextPackResult && !migrationPlanResult && !routeStarterResult) return null;

  return (
    <section className="analysis-card artifact-summary">
      <h3>Output Summary</h3>
      <div className="metric-grid">
        {rewriteResult ? <SummaryMetric label="Verified rewrite" value={`${rewriteResult.manifest.applied.length.toLocaleString()} applied`} /> : null}
        {contextPackResult ? <SummaryMetric label="AI context pack" value={`${contextPackResult.stats.estimatedTokenReduction.toLocaleString()}% smaller`} /> : null}
        {migrationPlanResult ? <SummaryMetric label="Migration plan" value={`${migrationPlanResult.stats.phases.toLocaleString()} phases`} /> : null}
        {routeStarterResult ? <SummaryMetric label="Route starter" value={routeStarterResult.stats.routePath} /> : null}
        <SummaryMetric label="Next action" value={nextActionLabel(report, rewriteResult, migrationPlanResult)} />
      </div>

      <div className="rewrite-change-list artifact-summary-list">
        {rewriteResult ? (
          <SummaryRow
            title="Verified rewrite"
            detail={`${rewriteResult.manifest.applied.length.toLocaleString()} applied · ${rewriteResult.manifest.rejected.length.toLocaleString()} rejected · ${rewriteResult.files.length.toLocaleString()} output files`}
          />
        ) : null}
        {contextPackResult ? (
          <SummaryRow
            title="AI context pack"
            detail={`${contextPackResult.stats.estimatedTokenReduction.toLocaleString()}% smaller · ${contextPackResult.stats.outputFiles.toLocaleString()} files · ${contextPackResult.stats.sourceReferences.toLocaleString()} refs`}
          />
        ) : null}
        {migrationPlanResult ? (
          <SummaryRow
            title="Migration plan"
            detail={`${migrationPlanResult.stats.readyPhases.toLocaleString()} ready · ${migrationPlanResult.stats.blockedPhases.toLocaleString()} blocked · ${migrationPlanResult.stats.reviewPhases.toLocaleString()} review`}
          />
        ) : null}
        {routeStarterResult ? (
          <SummaryRow
            title="Route starter"
            detail={`${routeStarterResult.stats.outputFiles.toLocaleString()} files · ${routeStarterResult.stats.components.toLocaleString()} components · ${routeStarterResult.stats.behaviorBindings.toLocaleString()} behavior bindings`}
          />
        ) : null}
        <SummaryRow title="Recommended next action" detail={nextActionDetail(report, rewriteResult, migrationPlanResult)} warning={Boolean(groupedProjectBlockersForReport(report).length)} />
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SummaryRow({ title, detail, warning = false }: { title: string; detail: string; warning?: boolean }) {
  return (
    <div className={warning ? "rewrite-change-row rewrite-change-warning" : "rewrite-change-row"}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function nextActionLabel(report: ProjectReport, rewriteResult: VerifiedRewriteArchive | null, migrationPlanResult: MigrationPlanPackBuild | null): string {
  const blocker = groupedProjectBlockersForReport(report)[0];
  if (blocker) return "Fix blocker";
  if (rewriteResult?.manifest.rejected.length) return "Review rewrite";
  if (migrationPlanResult?.stats.blockedPhases) return "Review phase";
  return "Convert routes";
}

function nextActionDetail(report: ProjectReport, rewriteResult: VerifiedRewriteArchive | null, migrationPlanResult: MigrationPlanPackBuild | null): string {
  const blocker = groupedProjectBlockersForReport(report)[0];
  if (blocker) {
    return `Fix or remove ${blocker.target} references from ${blocker.count.toLocaleString()} file(s).`;
  }
  if (rewriteResult?.manifest.rejected.length) {
    return `Review ${rewriteResult.manifest.rejected.length.toLocaleString()} rejected rewrite(s) before migration.`;
  }
  if (migrationPlanResult?.stats.blockedPhases) {
    return `Review ${migrationPlanResult.stats.blockedPhases.toLocaleString()} blocked migration phase(s).`;
  }
  return "Start route-by-route conversion using the migration plan and context pack.";
}
