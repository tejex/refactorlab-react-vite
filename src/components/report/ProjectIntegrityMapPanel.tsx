import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import { groupProjectBlockers } from "../../scanner/projectBlockers";
import type { ProjectIntegrityMap } from "../../scanner/types";

export function ProjectIntegrityMapPanel({ map }: { map: ProjectIntegrityMap }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const affectedFiles = new Set(map.missingReferences.map((reference) => reference.sourceFile)).size;
  const blockerGroups = groupProjectBlockers(map.missingReferences);

  return (
    <div className="dead-code-map">
      <div className="metric-grid">
        <button className="metric-card metric-button" type="button" onClick={() => setIsPanelOpen(true)}>
          <strong>{map.missingReferences.length.toLocaleString()}</strong>
          <span>Missing references</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => setIsPanelOpen(true)}>
          <strong>{affectedFiles.toLocaleString()}</strong>
          <span>Affected files</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => setIsPanelOpen(true)}>
          <strong>{blockerGroups.length.toLocaleString()}</strong>
          <span>Blocker targets</span>
        </button>
      </div>

      {map.missingReferences.length ? (
        <Drawer
          anchor="right"
          open={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
          slotProps={{ paper: { className: "selector-drawer" } }}
        >
          <section className="selector-panel" aria-label="Missing project references">
            <div className="selector-panel-head">
              <div>
                <span>Project Integrity Map</span>
                <strong>Missing references</strong>
              </div>
              <IconButton aria-label="Close missing references panel" onClick={() => setIsPanelOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </div>
            <div className="dead-code-list integrity-scroll-list">
              {blockerGroups.map((group) => (
                <div className="dead-code-row" key={group.id}>
                  <div>
                    <strong>{group.target}</strong>
                    <span>
                      {group.kind} referenced by {group.count.toLocaleString()} file(s): {group.sourceFiles.join(", ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Drawer>
      ) : (
        <p className="success-message">No missing local file references found.</p>
      )}
    </div>
  );
}
