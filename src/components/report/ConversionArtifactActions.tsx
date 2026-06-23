interface ConversionArtifactActionsProps {
  isContextPackAvailable: boolean;
  isRouteStarterAvailable: boolean;
  isConversionKitAvailable: boolean;
  isBuildingContextPack: boolean;
  isBuildingMigrationPlan: boolean;
  isBuildingRouteStarter: boolean;
  isBuildingConversionKit: boolean;
  onBuildContextPack?: () => void;
  onDownloadContextPack?: () => void;
  onBuildMigrationPlan?: () => void;
  onDownloadMigrationPlan?: () => void;
  onBuildRouteStarter?: () => void;
  onDownloadRouteStarter?: () => void;
  onBuildConversionKit?: () => void;
  onDownloadConversionKit?: () => void;
}

export function ConversionArtifactActions({
  isContextPackAvailable,
  isRouteStarterAvailable,
  isConversionKitAvailable,
  isBuildingContextPack,
  isBuildingMigrationPlan,
  isBuildingRouteStarter,
  isBuildingConversionKit,
  onBuildContextPack,
  onDownloadContextPack,
  onBuildMigrationPlan,
  onDownloadMigrationPlan,
  onBuildRouteStarter,
  onDownloadRouteStarter,
  onBuildConversionKit,
  onDownloadConversionKit,
}: ConversionArtifactActionsProps) {
  return (
    <div className="conversion-artifacts">
      <ArtifactAction
        title="Conversion kit"
        detail="Slim LLM handoff with route queue, assets, plan, context, starter, and rewrite facts."
        busyLabel="building..."
        buildLabel="build"
        downloadLabel="download"
        isBusy={isBuildingConversionKit}
        canBuild={Boolean(isConversionKitAvailable && onBuildConversionKit && !isBuildingConversionKit)}
        canDownload={Boolean(isConversionKitAvailable && onDownloadConversionKit && !isBuildingConversionKit)}
        onBuild={onBuildConversionKit}
        onDownload={onDownloadConversionKit}
      />
      <ArtifactAction
        title="AI context pack"
        detail="Compact source facts for an LLM handoff."
        busyLabel="building..."
        buildLabel="build"
        downloadLabel="download"
        isBusy={isBuildingContextPack}
        canBuild={Boolean(isContextPackAvailable && onBuildContextPack && !isBuildingContextPack)}
        canDownload={Boolean(isContextPackAvailable && onDownloadContextPack && !isBuildingContextPack)}
        onBuild={onBuildContextPack}
        onDownload={onDownloadContextPack}
      />
      <ArtifactAction
        title="Migration plan"
        detail="Ordered phases from parser evidence."
        busyLabel="building..."
        buildLabel="build"
        downloadLabel="download"
        isBusy={isBuildingMigrationPlan}
        canBuild={Boolean(onBuildMigrationPlan && !isBuildingMigrationPlan)}
        canDownload={Boolean(onDownloadMigrationPlan && !isBuildingMigrationPlan)}
        onBuild={onBuildMigrationPlan}
        onDownload={onDownloadMigrationPlan}
      />
      <ArtifactAction
        title="Route starter"
        detail="Starter scaffold for one route."
        busyLabel="building..."
        buildLabel="build"
        downloadLabel="download"
        isBusy={isBuildingRouteStarter}
        canBuild={Boolean(isRouteStarterAvailable && onBuildRouteStarter && !isBuildingRouteStarter)}
        canDownload={Boolean(isRouteStarterAvailable && onDownloadRouteStarter && !isBuildingRouteStarter)}
        onBuild={onBuildRouteStarter}
        onDownload={onDownloadRouteStarter}
      />
    </div>
  );
}

function ArtifactAction({
  title,
  detail,
  busyLabel,
  buildLabel,
  downloadLabel,
  isBusy,
  canBuild,
  canDownload,
  onBuild,
  onDownload,
}: {
  title: string;
  detail: string;
  busyLabel: string;
  buildLabel: string;
  downloadLabel: string;
  isBusy: boolean;
  canBuild: boolean;
  canDownload: boolean;
  onBuild?: () => void;
  onDownload?: () => void;
}) {
  return (
    <div className="artifact-action">
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="artifact-action-buttons">
        <button className="rewrite-run-button" type="button" disabled={!canBuild} onClick={onBuild}>
          {isBusy ? busyLabel : buildLabel}
        </button>
        <button className="link-button" type="button" disabled={!canDownload} onClick={onDownload}>
          {downloadLabel}
        </button>
      </div>
    </div>
  );
}
