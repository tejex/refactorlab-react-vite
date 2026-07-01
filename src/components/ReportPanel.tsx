import type { ProjectReport } from "../scanner/types";
import { ArtifactSummaryPanel } from "./report/ArtifactSummaryPanel";
import { ReactConversionMapPanel } from "./report/ReactConversionMapPanel";
import { VerifiedRewritePanel } from "./report/VerifiedRewritePanel";
import type { AiContextPackBuild } from "../scanner/aiContextPack";
import type { ConversionKitBuild } from "../scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../scanner/routeStarterPack";
import type { VerifiedRewriteArchive } from "../scanner/verifiedRewriteEngine";

interface ReportPanelProps {
  report: ProjectReport | null;
  onRunVerifiedRewrite?: () => void;
  onDownloadVerifiedRewrite?: () => void;
  onBuildAiContextPack?: () => void;
  onDownloadAiContextPack?: () => void;
  onBuildMigrationPlan?: () => void;
  onDownloadMigrationPlan?: () => void;
  onBuildRouteStarter?: () => void;
  onDownloadRouteStarter?: () => void;
  onBuildConversionKit?: () => void;
  onDownloadConversionKit?: () => void;
  rewriteResult?: VerifiedRewriteArchive | null;
  contextPackResult?: AiContextPackBuild | null;
  migrationPlanResult?: MigrationPlanPackBuild | null;
  routeStarterResult?: RouteStarterPackBuild | null;
  conversionKitResult?: ConversionKitBuild | null;
  isRewriteAvailable?: boolean;
  isCheckingRewrite?: boolean;
  isRewriting?: boolean;
  isContextPackAvailable?: boolean;
  isRouteStarterAvailable?: boolean;
  isConversionKitAvailable?: boolean;
  isBuildingContextPack?: boolean;
  isBuildingMigrationPlan?: boolean;
  isBuildingRouteStarter?: boolean;
  isBuildingConversionKit?: boolean;
}

export function ReportPanel({
  report,
  onRunVerifiedRewrite,
  onDownloadVerifiedRewrite,
  onBuildAiContextPack,
  onDownloadAiContextPack,
  onBuildMigrationPlan,
  onDownloadMigrationPlan,
  onBuildRouteStarter,
  onDownloadRouteStarter,
  onBuildConversionKit,
  onDownloadConversionKit,
  rewriteResult = null,
  contextPackResult = null,
  migrationPlanResult = null,
  routeStarterResult = null,
  conversionKitResult = null,
  isRewriteAvailable = false,
  isCheckingRewrite = false,
  isRewriting = false,
  isContextPackAvailable = false,
  isRouteStarterAvailable = false,
  isConversionKitAvailable = false,
  isBuildingContextPack = false,
  isBuildingMigrationPlan = false,
  isBuildingRouteStarter = false,
  isBuildingConversionKit = false,
}: ReportPanelProps) {
  if (!report) {
    return (
      <div id="report" className="panel">
        <h2>Outputs</h2>
        <p>No project scanned yet.</p>
      </div>
    );
  }

  return (
    <div id="report" className="panel">
      <header className="report-header">
        <div>
          <p>Project</p>
          <h2>{report.sourceName}</h2>
        </div>
        <div>
          <p>Parsed source</p>
          <h2>{report.summary}</h2>
        </div>
      </header>

      <ArtifactSummaryPanel
        report={report}
        rewriteResult={rewriteResult}
        contextPackResult={contextPackResult}
        migrationPlanResult={migrationPlanResult}
        routeStarterResult={routeStarterResult}
      />

      {report.inlineAssetPlan ? (
        <section className="analysis-card">
          <h3>Verified rewrite output</h3>
          <VerifiedRewritePanel
            report={report}
            isAvailable={isRewriteAvailable}
            isChecking={isCheckingRewrite}
            isRewriting={isRewriting}
            result={rewriteResult}
            onRun={onRunVerifiedRewrite}
            onDownload={onDownloadVerifiedRewrite}
          />
        </section>
      ) : null}

      {report.reactConversionMap ? (
        <section className="analysis-card">
          <h3>AI handoff outputs</h3>
          <ReactConversionMapPanel
            report={report}
            contextPackResult={contextPackResult}
            migrationPlanResult={migrationPlanResult}
            routeStarterResult={routeStarterResult}
            conversionKitResult={conversionKitResult}
            isContextPackAvailable={isContextPackAvailable}
            isRouteStarterAvailable={isRouteStarterAvailable}
            isConversionKitAvailable={isConversionKitAvailable}
            isBuildingContextPack={isBuildingContextPack}
            isBuildingRouteStarter={isBuildingRouteStarter}
            isBuildingConversionKit={isBuildingConversionKit}
            onBuildContextPack={onBuildAiContextPack}
            onDownloadContextPack={onDownloadAiContextPack}
            isBuildingMigrationPlan={isBuildingMigrationPlan}
            onBuildMigrationPlan={onBuildMigrationPlan}
            onDownloadMigrationPlan={onDownloadMigrationPlan}
            onBuildRouteStarter={onBuildRouteStarter}
            onDownloadRouteStarter={onDownloadRouteStarter}
            onBuildConversionKit={onBuildConversionKit}
            onDownloadConversionKit={onDownloadConversionKit}
          />
        </section>
      ) : null}
    </div>
  );
}
