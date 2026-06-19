import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import type { DuplicateCssMap } from "../../scanner/types";

export function DuplicateCssMapPanel({ map }: { map: DuplicateCssMap }) {
  const [isSelectorPanelOpen, setIsSelectorPanelOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"selectors" | "files">("selectors");
  const mostRepeated = map.repeatedSelectors[0];

  function openDrawer(mode: "selectors" | "files") {
    setDrawerMode(mode);
    setIsSelectorPanelOpen(true);
  }

  return (
    <div className="duplicate-css-map">
      <div className="metric-grid duplicate-css-actions">
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("selectors")}>
          <strong>{map.repeatedSelectors.length.toLocaleString()}</strong>
          <span>Repeated selectors</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("files")}>
          <strong>{mostRepeated ? `${mostRepeated.count} files` : "0 files"}</strong>
          <span>Most repeated</span>
        </button>
      </div>

      {map.repeatedSelectors.length ? (
        <Drawer
          anchor="right"
          open={isSelectorPanelOpen}
          onClose={() => setIsSelectorPanelOpen(false)}
          slotProps={{ paper: { className: "selector-drawer" } }}
        >
          <section className="selector-panel" aria-label="Repeated CSS selectors">
            <div className="selector-panel-head">
              <div>
                <span>Duplicate CSS Map</span>
                <strong>{drawerMode === "selectors" ? "Repeated selectors" : "Most repeated files"}</strong>
              </div>
              <IconButton aria-label="Close repeated selectors panel" onClick={() => setIsSelectorPanelOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </div>
            {drawerMode === "selectors" ? (
              <div className="duplicate-css-list">
                {map.repeatedSelectors.slice(0, 20).map((item) => (
                  <div className="duplicate-css-row" key={item.selector}>
                    <div>
                      <strong>{item.selector}</strong>
                      <span>{item.count.toLocaleString()} source file(s)</span>
                    </div>
                    <small>{item.sources.slice(0, 4).join(", ")}{item.sources.length > 4 ? "..." : ""}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="duplicate-css-list">
                <div className="duplicate-css-row most-repeated-summary">
                  <div>
                    <span>Most repeated selector</span>
                    <strong>{mostRepeated?.selector ?? "none"}</strong>
                    <span>Appears in {mostRepeated?.count.toLocaleString() ?? "0"} files</span>
                  </div>
                </div>
                <div className="file-list-panel">
                  <strong>Files</strong>
                  {(mostRepeated?.sources ?? []).map((source) => (
                    <span key={source}>{source}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </Drawer>
      ) : (
        <p className="success-message">No repeated CSS selectors found across source files.</p>
      )}
    </div>
  );
}
