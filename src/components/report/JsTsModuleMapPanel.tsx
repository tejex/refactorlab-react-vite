import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import type { JsTsModuleMap } from "../../scanner/types";
import { EmptyDrawerRow } from "./EmptyDrawerRow";

export function JsTsModuleMapPanel({ map }: { map: JsTsModuleMap }) {
  const [drawerMode, setDrawerMode] = useState<"files" | "resolved" | "unresolved" | "sideEffects">("files");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const sideEffectFiles = map.files.filter((file) => file.sideEffects > 0);

  function openDrawer(mode: "files" | "resolved" | "unresolved" | "sideEffects") {
    setDrawerMode(mode);
    setIsPanelOpen(true);
  }

  return (
    <div className="dead-code-map">
      <div className="metric-grid">
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("files")}>
          <strong>{map.files.length.toLocaleString()}</strong>
          <span>JS/TS files</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("resolved")}>
          <strong>{map.resolvedImports.length.toLocaleString()}</strong>
          <span>Resolved local imports</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("unresolved")}>
          <strong>{map.unresolvedImports.length.toLocaleString()}</strong>
          <span>Unresolved imports</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("sideEffects")}>
          <strong>{sideEffectFiles.length.toLocaleString()}</strong>
          <span>Behavior files</span>
        </button>
      </div>

      {map.files.length ? (
        <Drawer
          anchor="right"
          open={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
          slotProps={{ paper: { className: "selector-drawer" } }}
        >
          <section className="selector-panel" aria-label="JS and TypeScript module map">
            <div className="selector-panel-head">
              <div>
                <span>JS/TS Module Map</span>
                <strong>{jsTsDrawerTitle(drawerMode)}</strong>
              </div>
              <IconButton aria-label="Close JS/TS module panel" onClick={() => setIsPanelOpen(false)}>
                <CloseRoundedIcon />
              </IconButton>
            </div>
            <div className="dead-code-list">
              {drawerMode === "resolved" ? (
                map.resolvedImports.length ? (
                  map.resolvedImports.map((item) => (
                    <div className="dead-code-row" key={`${item.sourceFile}-${item.importPath}-${item.resolvedPath}`}>
                      <div>
                        <strong>{item.importPath}</strong>
                        <span>{item.sourceFile} → {item.resolvedPath}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyDrawerRow title="No resolved local imports" body="No relative JS/TS imports pointed to project files." />
                )
              ) : drawerMode === "unresolved" ? (
                map.unresolvedImports.length ? (
                  map.unresolvedImports.map((item) => (
                    <div className="dead-code-row" key={`${item.sourceFile}-${item.importPath}`}>
                      <div>
                        <strong>{item.importPath}</strong>
                        <span>imported by {item.sourceFile}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyDrawerRow title="No unresolved imports" body="All detected relative JS/TS imports resolved." />
                )
              ) : (
                (drawerMode === "sideEffects" ? sideEffectFiles : map.files).map((file) => (
                  <div className="dead-code-row" key={file.path}>
                    <div>
                      <strong>{file.path}</strong>
                      <span>
                        {file.imports.toLocaleString()} imports · {file.exports.toLocaleString()} exports ·{" "}
                        {file.sideEffects.toLocaleString()} behavior signals
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </Drawer>
      ) : (
        <p className="success-message">No JS/TS source files found.</p>
      )}
    </div>
  );
}

function jsTsDrawerTitle(mode: "files" | "resolved" | "unresolved" | "sideEffects"): string {
  if (mode === "resolved") return "Resolved local imports";
  if (mode === "unresolved") return "Unresolved imports";
  if (mode === "sideEffects") return "Behavior files";
  return "Module files";
}
