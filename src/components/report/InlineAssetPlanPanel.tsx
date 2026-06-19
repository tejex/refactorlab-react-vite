import type { InlineAssetPlan } from "../../scanner/types";
import { Metric } from "./Metric";

export function InlineAssetPlanPanel({
  plan,
  onOpenExtractionMap,
}: {
  plan: InlineAssetPlan;
  onOpenExtractionMap?: () => void;
}) {
  const styleCount = plan.blocks.filter((block) => block.kind === "style").length;
  const scriptCount = plan.blocks.filter((block) => block.kind === "script").length;
  const lowSafetyCount = plan.blocks.filter((block) => block.safety === "Low").length;
  const safeChanges = plan.guaranteedSafeChanges;

  return (
    <div className="asset-plan">
      <div className="metric-grid">
        <Metric label="Inline styles" value={styleCount.toLocaleString()} />
        <Metric label="Inline scripts" value={scriptCount.toLocaleString()} />
        <Metric label="Timing-sensitive" value={lowSafetyCount.toLocaleString()} />
        <Metric label="Guaranteed safe" value={safeChanges.length.toLocaleString()} />
      </div>

      {safeChanges.length > 0 ? (
        <button className="link-button" type="button" onClick={onOpenExtractionMap}>
          open extraction map
        </button>
      ) : null}
    </div>
  );
}
