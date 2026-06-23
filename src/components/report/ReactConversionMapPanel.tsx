import { useState } from "react";
import type { AiContextPackBuild } from "../../scanner/aiContextPack";
import type { ConversionKitBuild } from "../../scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../../scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../../scanner/routeStarterPack";
import type { ProjectReport, ReactConversionMap } from "../../scanner/types";
import { ConversionArtifactActions } from "./ConversionArtifactActions";
import { ContextPackResult, ConversionKitResult, MigrationPlanResult, RouteStarterResult } from "./ConversionArtifactResults";
import { ReactConversionDrawer, type ReactConversionDrawerMode } from "./ReactConversionDrawer";

interface ReactConversionMapPanelProps {
  map: ReactConversionMap;
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
  map,
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
  const [drawerMode, setDrawerMode] = useState<ReactConversionDrawerMode>("handoff");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function openDrawer(mode: ReactConversionDrawerMode) {
    setDrawerMode(mode);
    setIsPanelOpen(true);
  }

  return (
    <div className="dead-code-map">
      <div className="metric-grid">
        <MetricButton value={map.aiHandoff.status} label="AI handoff" onClick={() => openDrawer("handoff")} />
        <MetricButton value={map.routes.length} label="Route candidates" onClick={() => openDrawer("routes")} />
        <MetricButton value={map.routePackets.length} label="Route packets" onClick={() => openDrawer("packets")} />
        <MetricButton value={map.componentCandidates.length} label="Component candidates" onClick={() => openDrawer("components")} />
        <MetricButton value={map.componentOwnership.length} label="Component owners" onClick={() => openDrawer("owners")} />
        <MetricButton value={map.behaviorBindings.length} label="Behavior bindings" onClick={() => openDrawer("bindings")} />
        <MetricButton value={map.behaviorFiles.length} label="Behavior files" onClick={() => openDrawer("behavior")} />
        <MetricButton value={map.blockers.length} label="Conversion blockers" onClick={() => openDrawer("blockers")} />
      </div>

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
      <ReactConversionDrawer map={map} mode={drawerMode} open={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </div>
  );
}

function MetricButton({ value, label, onClick }: { value: number | string; label: string; onClick: () => void }) {
  return (
    <button className="metric-card metric-button" type="button" onClick={onClick}>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </button>
  );
}
