import type { ProjectReport } from "../scanner/types";
import { ArtifactSummaryPanel } from "./report/ArtifactSummaryPanel";
import { DeadCodeMapPanel } from "./report/DeadCodeMapPanel";
import { DuplicateCssMapPanel } from "./report/DuplicateCssMapPanel";
import { EvidencePanel } from "./report/EvidencePanel";
import { InlineAssetPlanPanel } from "./report/InlineAssetPlanPanel";
import { JsTsModuleMapPanel } from "./report/JsTsModuleMapPanel";
import { ProjectCapabilityMapPanel } from "./report/ProjectCapabilityMapPanel";
import { ProjectIntegrityMapPanel } from "./report/ProjectIntegrityMapPanel";
import { ReactConversionMapPanel } from "./report/ReactConversionMapPanel";
import { VerifiedRewritePanel } from "./report/VerifiedRewritePanel";
import type { AiContextPackBuild } from "../scanner/aiContextPack";
import type { ConversionKitBuild } from "../scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../scanner/routeStarterPack";
import type { VerifiedRewriteArchive } from "../scanner/verifiedRewriteEngine";

interface ReportPanelProps {
  report: ProjectReport | null;
  onOpenExtractionMap?: () => void;
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
  onOpenExtractionMap,
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
        <h2>Report</h2>
        <p>No project scanned yet.</p>
      </div>
    );
  }

  return (
    <div id="report" className="panel">
      <header className="report-header">
        <div>
          <p>Readiness score</p>
          <h2>{report.score}/100</h2>
        </div>
        <div>
          <p>Analyzed source</p>
          <h2>{report.sourceName}</h2>
        </div>
      </header>

      <p className="report-summary">{report.summary}</p>

      {report.capabilityMap ? <ProjectCapabilityMapPanel map={report.capabilityMap} /> : null}

      <ArtifactSummaryPanel
        report={report}
        rewriteResult={rewriteResult}
        contextPackResult={contextPackResult}
        migrationPlanResult={migrationPlanResult}
        routeStarterResult={routeStarterResult}
      />

      {report.evidence ? (
        <details>
          <summary>Facts</summary>
          <EvidencePanel evidence={report.evidence} />
        </details>
      ) : null}

      {report.inlineAssetPlan ? (
        <details open>
          <summary>Extraction</summary>
          <InlineAssetPlanPanel plan={report.inlineAssetPlan} onOpenExtractionMap={onOpenExtractionMap} />
        </details>
      ) : null}

      {report.inlineAssetPlan ? (
        <section className="analysis-card">
          <h3>Verified Rewrite Engine</h3>
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
          <h3>AI Conversion Readiness</h3>
          <ReactConversionMapPanel
            map={report.reactConversionMap}
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

      {report.deadCodeMap ? (
        <section className="analysis-card">
          <h3>Dead Code Map</h3>
          <DeadCodeMapPanel map={report.deadCodeMap} />
        </section>
      ) : null}

      {report.integrityMap ? (
        <section className="analysis-card">
          <h3>Project Integrity Map</h3>
          <ProjectIntegrityMapPanel map={report.integrityMap} />
        </section>
      ) : null}

      {report.jsTsModuleMap ? (
        <section className="analysis-card">
          <h3>JS/TS Module Map</h3>
          <JsTsModuleMapPanel map={report.jsTsModuleMap} />
        </section>
      ) : null}

      {report.duplicateCssMap ? (
        <details open>
          <summary>Duplicate CSS Map</summary>
          <DuplicateCssMapPanel map={report.duplicateCssMap} />
        </details>
      ) : null}
    </div>
  );
}
