import type { AiContextPackBuild } from "../../scanner/aiContextPack";
import type { ConversionKitBuild } from "../../scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../../scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../../scanner/routeStarterPack";
import type { ProjectReport } from "../../scanner/types";
import { ConversionArtifactActions } from "./ConversionArtifactActions";
import { ContextPackResult, ConversionKitResult, MigrationPlanResult, RouteStarterResult } from "./ConversionArtifactResults";

interface ReactConversionMapPanelProps {
  report: ProjectReport;
  contextPackResult?: AiContextPackBuild | null;
  migrationPlanResult?: MigrationPlanPackBuild | null;
  routeStarterResult?: RouteStarterPackBuild | null;
  conversionKitResult?: ConversionKitBuild | null;
  isContextPackAvailable?: boolean;
  isRouteStarterAvailable?: boolean;
  isConversionKitAvailable?: boolean;
  isBuildingContextPack?: boolean;
  isBuildingMigrationPlan?: boolean;
  isBuildingRouteStarter?: boolean;
  isBuildingConversionKit?: boolean;
  onBuildContextPack?: () => void;
  onDownloadContextPack?: () => void;
  onBuildMigrationPlan?: () => void;
  onDownloadMigrationPlan?: () => void;
  onBuildRouteStarter?: () => void;
  onDownloadRouteStarter?: () => void;
  onBuildConversionKit?: () => void;
  onDownloadConversionKit?: () => void;
}

export function ReactConversionMapPanel({
  report,
  contextPackResult = null,
  migrationPlanResult = null,
  routeStarterResult = null,
  conversionKitResult = null,
  isContextPackAvailable = false,
  isRouteStarterAvailable = false,
  isConversionKitAvailable = false,
  isBuildingContextPack = false,
  isBuildingMigrationPlan = false,
  isBuildingRouteStarter = false,
  isBuildingConversionKit = false,
  onBuildContextPack,
  onDownloadContextPack,
  onBuildMigrationPlan,
  onDownloadMigrationPlan,
  onBuildRouteStarter,
  onDownloadRouteStarter,
  onBuildConversionKit,
  onDownloadConversionKit,
}: ReactConversionMapPanelProps) {
  return (
    <div className="handoff-output-panel">
      <ConversionArtifactActions
        isContextPackAvailable={isContextPackAvailable}
        isRouteStarterAvailable={isRouteStarterAvailable}
        isConversionKitAvailable={isConversionKitAvailable}
        isBuildingContextPack={isBuildingContextPack}
        isBuildingMigrationPlan={isBuildingMigrationPlan}
        isBuildingRouteStarter={isBuildingRouteStarter}
        isBuildingConversionKit={isBuildingConversionKit}
        onBuildContextPack={onBuildContextPack}
        onDownloadContextPack={onDownloadContextPack}
        onBuildMigrationPlan={onBuildMigrationPlan}
        onDownloadMigrationPlan={onDownloadMigrationPlan}
        onBuildRouteStarter={onBuildRouteStarter}
        onDownloadRouteStarter={onDownloadRouteStarter}
        onBuildConversionKit={onBuildConversionKit}
        onDownloadConversionKit={onDownloadConversionKit}
      />

      {conversionKitResult ? <ConversionKitResult result={conversionKitResult} /> : null}
      {contextPackResult ? <ContextPackResult result={contextPackResult} report={report} /> : null}
      {migrationPlanResult ? <MigrationPlanResult result={migrationPlanResult} report={report} /> : null}
      {routeStarterResult ? <RouteStarterResult result={routeStarterResult} report={report} /> : null}
    </div>
  );
}
