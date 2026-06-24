import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import type { DeadCodeMap } from "../../scanner/types";

export function DeadCodeMapPanel({ map }: { map: DeadCodeMap }) {
  const highConfidence = map.unreachableFiles.filter((candidate) => candidate.confidence === "High");
  const review = map.unreachableFiles.filter((candidate) => candidate.confidence === "Review");
  const [drawerMode, setDrawerMode] = useState<"unused" | "high" | "review">("unused");
  const [isDeadCodePanelOpen, setIsDeadCodePanelOpen] = useState(false);
  const visibleCandidates =
    drawerMode === "high" ? highConfidence : drawerMode === "review" ? review : map.unreachableFiles;

  function openDrawer(mode: "unused" | "high" | "review") {
    setDrawerMode(mode);
    setIsDeadCodePanelOpen(true);
  }

  return (
    <div className="dead-code-map">
      <p className="analysis-note">
        Legacy analysis: HTML entrypoints only. Results may omit Workers, functions, scripts, and other deployment roots. Automatic deletion is disabled.
      </p>
      <div className="metric-grid">
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("unused")}>
          <strong>{map.unreachableFiles.length.toLocaleString()}</strong>
          <span>Unused candidates</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("high")}>
          <strong>{highConfidence.length.toLocaleString()}</strong>
          <span>High confidence</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("review")}>
          <strong>{review.length.toLocaleString()}</strong>
          <span>Review needed</span>
        </button>
      </div>

      {map.unreachableFiles.length ? (
        <Drawer
          anchor="right"
          open={isDeadCodePanelOpen}
          onClose={() => setIsDeadCodePanelOpen(false)}
          slotProps={{ paper: { className: "selector-drawer" } }}
        >
          <section className="selector-panel" aria-label="Dead code candidates">
            <div className="selector-panel-head">
              <div>
                <span>Dead Code Map</span>
                <strong>{deadCodeDrawerTitle(drawerMode)}</strong>
              </div>
              <IconButton aria-label="Close dead code panel" onClick={() => setIsDeadCodePanelOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </div>
            <div className="dead-code-list">
              {visibleCandidates.map((candidate) => (
                <div className="dead-code-row" key={candidate.path}>
                  <div>
                    <strong>{candidate.path}</strong>
                    <span>{candidate.lines.toLocaleString()} lines · {candidate.reason}</span>
                  </div>
                  <b className={candidate.confidence === "High" ? "confidence-high" : "confidence-review"}>
                    {candidate.confidence}
                  </b>
                </div>
              ))}
            </div>
          </section>
        </Drawer>
      ) : (
        <p className="success-message">No unreachable source files found from the detected entrypoints.</p>
      )}
    </div>
  );
}

function deadCodeDrawerTitle(mode: "unused" | "high" | "review"): string {
  if (mode === "high") return "High confidence candidates";
  if (mode === "review") return "Review needed";
  return "Unused candidates";
}
