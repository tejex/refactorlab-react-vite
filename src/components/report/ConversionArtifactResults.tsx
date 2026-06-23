import type { AiContextPackBuild } from "../../scanner/aiContextPack";
import type { ConversionKitBuild } from "../../scanner/conversionKit";
import type { MigrationPlanPackBuild } from "../../scanner/migrationPlanPack";
import type { RouteStarterPackBuild } from "../../scanner/routeStarterPack";
import type { ProjectReport } from "../../scanner/types";

export function ContextPackResult({ result, report }: { result: AiContextPackBuild; report: ProjectReport }) {
  const stats = result.stats;
  const previewFiles = result.files
    .map((file) => file.path.replace("fixer-ai-context-pack/", ""))
    .filter((path) => !path.startsWith("source-snippets/"))
    .slice(0, 6);

  return (
    <ArtifactResult
      metrics={[
        [`${stats.sourceReferences.toLocaleString()}`, "Source refs"],
        [`${stats.sourceSnippets.toLocaleString()}`, "Snippets"],
        [`${stats.outputFiles.toLocaleString()}`, "Pack files"],
        [`${stats.estimatedTokenReduction.toLocaleString()}%`, "Smaller than source"],
      ]}
      rows={[
        [
          report.sourceName,
          `${stats.routes.toLocaleString()} routes · ${stats.componentOwners.toLocaleString()} owners · ${stats.behaviorBindings.toLocaleString()} behavior bindings`,
        ],
        ...previewFiles.map((path): [string, string] => [path, "included in context pack"]),
      ]}
    />
  );
}

export function MigrationPlanResult({ result, report }: { result: MigrationPlanPackBuild; report: ProjectReport }) {
  const stats = result.stats;
  return (
    <ArtifactResult
      metrics={[
        [`${stats.phases.toLocaleString()}`, "Plan phases"],
        [`${stats.readyPhases.toLocaleString()}`, "Ready phases"],
        [`${stats.blockedPhases.toLocaleString()}`, "Blocked phases"],
        [`${stats.outputFiles.toLocaleString()}`, "Plan files"],
      ]}
      rows={[
        [
          report.sourceName,
          `${stats.routePackets.toLocaleString()} route packets · ${stats.componentOwners.toLocaleString()} owners · ${stats.behaviorBindings.toLocaleString()} behavior bindings`,
        ],
        ...result.phases.slice(0, 6).map((phase): [string, string, boolean] => [phase.title, `${phase.status} · ${phase.summary}`, phase.status === "blocked"]),
      ]}
    />
  );
}

export function RouteStarterResult({ result, report }: { result: RouteStarterPackBuild; report: ProjectReport }) {
  const stats = result.stats;
  const previewFiles = result.files.map((file) => file.path.replace("fixer-route-starter-pack/", "")).slice(0, 8);
  return (
    <ArtifactResult
      metrics={[
        [stats.routePath, "Starter route"],
        [`${stats.components.toLocaleString()}`, "Components"],
        [`${stats.behaviorBindings.toLocaleString()}`, "Behavior bindings"],
        [`${stats.outputFiles.toLocaleString()}`, "Starter files"],
      ]}
      rows={[
        [report.sourceName, `${stats.sourceFile} · ${stats.cssSelectors.toLocaleString()} selectors · ${stats.assets.toLocaleString()} assets`],
        ...previewFiles.map((path): [string, string] => [path, "included in route starter pack"]),
      ]}
    />
  );
}

export function ConversionKitResult({ result }: { result: ConversionKitBuild }) {
  const stats = result.stats;
  return (
    <ArtifactResult
      metrics={[
        [`${stats.outputFiles.toLocaleString()}`, "Kit files"],
        [`${stats.routePackets.toLocaleString()}`, "Route packets"],
        [`${stats.assetManifestAssets.toLocaleString()}`, "Assets mapped"],
        [`${stats.verifiedRewriteApplied.toLocaleString()}`, "Verified rewrites"],
        [`${stats.omittedVerifiedRewriteFiles.toLocaleString()}`, "Heavy files omitted"],
      ]}
      rows={[
        ["Package mode", stats.packageMode],
        ["Target", result.manifest.targetProfile.framework],
        ["Route queue", `${stats.routePackets.toLocaleString()} route(s), ${stats.blockers.toLocaleString()} blocker(s)`],
        ["Asset manifest", `${stats.assetManifestAssets.toLocaleString()} asset(s), ${stats.missingAssetReferences.toLocaleString()} missing reference(s)`],
        ["Verified rewrite", `${stats.verifiedRewriteApplied.toLocaleString()} applied change(s), summary only`],
        ["Starter route", stats.routeStarterRoute ?? "none"],
        ...result.manifest.sections.map((section): [string, string] => [section.path, section.purpose]),
      ]}
    />
  );
}

function ArtifactResult({ metrics, rows }: { metrics: Array<[string, string]>; rows: Array<[string, string, boolean?]> }) {
  return (
    <div className="rewrite-run-result context-pack-result">
      <div className="metric-grid">
        {metrics.map(([value, label]) => (
          <div className="metric-card" key={`${label}-${value}`}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="rewrite-change-list">
        {rows.map(([title, detail, warning]) => (
          <div className={warning ? "rewrite-change-row rewrite-change-warning" : "rewrite-change-row"} key={`${title}-${detail}`}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
