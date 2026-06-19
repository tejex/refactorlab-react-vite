import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Drawer, IconButton } from "@mui/material";
import { downloadReactHandoffPack } from "../../scanner/safeChangeZip";
import type { ProjectReport, ReactConversionMap } from "../../scanner/types";
import { EmptyDrawerRow } from "./EmptyDrawerRow";

type ReactConversionDrawerMode = "handoff" | "routes" | "packets" | "components" | "owners" | "bindings" | "behavior" | "blockers";

export function ReactConversionMapPanel({ map, report }: { map: ReactConversionMap; report: ProjectReport }) {
  const [drawerMode, setDrawerMode] = useState<ReactConversionDrawerMode>("handoff");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function openDrawer(mode: ReactConversionDrawerMode) {
    setDrawerMode(mode);
    setIsPanelOpen(true);
  }

  return (
    <div className="dead-code-map">
      <div className="metric-grid">
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("handoff")}>
          <strong>{map.aiHandoff.status}</strong>
          <span>AI handoff</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("routes")}>
          <strong>{map.routes.length.toLocaleString()}</strong>
          <span>Route candidates</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("packets")}>
          <strong>{map.routePackets.length.toLocaleString()}</strong>
          <span>Route packets</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("components")}>
          <strong>{map.componentCandidates.length.toLocaleString()}</strong>
          <span>Component candidates</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("owners")}>
          <strong>{map.componentOwnership.length.toLocaleString()}</strong>
          <span>Component owners</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("bindings")}>
          <strong>{map.behaviorBindings.length.toLocaleString()}</strong>
          <span>Behavior bindings</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("behavior")}>
          <strong>{map.behaviorFiles.length.toLocaleString()}</strong>
          <span>Behavior files</span>
        </button>
        <button className="metric-card metric-button" type="button" onClick={() => openDrawer("blockers")}>
          <strong>{map.blockers.length.toLocaleString()}</strong>
          <span>Conversion blockers</span>
        </button>
      </div>

      <button className="link-button" type="button" onClick={() => downloadReactHandoffPack(report)}>
        download AI handoff pack
      </button>

      <Drawer
        anchor="right"
        open={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        slotProps={{ paper: { className: "selector-drawer" } }}
      >
        <section className="selector-panel" aria-label="AI conversion readiness">
          <div className="selector-panel-head">
            <div>
              <span>AI Conversion Readiness</span>
              <strong>{reactConversionDrawerTitle(drawerMode)}</strong>
            </div>
            <IconButton aria-label="Close React conversion panel" onClick={() => setIsPanelOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </div>
          <div className="dead-code-list">
            {drawerMode === "handoff" ? (
              <AiHandoffPanelContent map={map} />
            ) : drawerMode === "routes" ? (
              map.routes.length ? (
                map.routes.map((route) => (
                  <div className="dead-code-row" key={route.sourceFile}>
                    <div>
                      <strong>{route.routePath}</strong>
                      <span>
                        {route.sourceFile}{" -> "}{route.componentName} · {route.stylesheets} css · {route.scripts} scripts ·{" "}
                        {route.inlineBlocks} inline blocks
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No route candidates" body="No HTML pages were found." />
              )
            ) : drawerMode === "packets" ? (
              map.routePackets.length ? (
                map.routePackets.map((packet) => (
                  <div className="dead-code-row" key={packet.slug}>
                    <div>
                      <strong>{packet.routePath}</strong>
                      <span>{routePacketSummary(packet)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No route packets" body="No route-level conversion packets were generated." />
              )
            ) : drawerMode === "components" ? (
              map.componentCandidates.length ? (
                map.componentCandidates.map((candidate) => (
                  <div className="dead-code-row" key={`${candidate.sourceFile}-${candidate.selector}-${candidate.name}`}>
                    <div>
                      <strong>{candidate.name}</strong>
                      <span>
                        {candidate.confidence} · {candidate.signals.join(", ")} · {candidate.sourceFile} · {candidate.selector}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No component candidates" body="No semantic HTML sections were found." />
              )
            ) : drawerMode === "owners" ? (
              map.componentOwnership.length ? (
                map.componentOwnership.map((owner) => (
                  <div className="dead-code-row" key={`${owner.componentName}-${owner.selector}`}>
                    <div>
                      <strong>{owner.componentName}</strong>
                      <span>{componentOwnerSummary(owner)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No component ownership" body="No component candidates had owned CSS, behavior, assets, or repeated route usage." />
              )
            ) : drawerMode === "bindings" ? (
              map.behaviorBindings.length ? (
                map.behaviorBindings.map((binding) => (
                  <div className="dead-code-row" key={`${binding.sourceFile}-${binding.selector}-${binding.event}-${binding.line}`}>
                    <div>
                      <strong>{binding.selector}</strong>
                      <span>{behaviorBindingSummary(binding)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No behavior bindings" body="No selector-to-event bindings were detected." />
              )
            ) : drawerMode === "behavior" ? (
              map.behaviorFiles.length ? (
                map.behaviorFiles.map((file) => (
                  <div className="dead-code-row" key={file.path}>
                    <div>
                      <strong>{file.path}</strong>
                      <span>{file.sideEffects.toLocaleString()} behavior signals</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyDrawerRow title="No behavior files" body="No JS/TS files with behavior signals were detected." />
              )
            ) : map.blockers.length ? (
              map.blockers.map((blocker) => (
                <div className="dead-code-row" key={`${blocker.sourceFile}-${blocker.missingPath}-${blocker.kind}`}>
                  <div>
                    <strong>{blocker.missingPath}</strong>
                    <span>{blocker.kind} referenced by {blocker.sourceFile}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyDrawerRow title="No conversion blockers" body="No missing local references were found." />
            )}
          </div>
        </section>
      </Drawer>
    </div>
  );
}

function reactConversionDrawerTitle(mode: ReactConversionDrawerMode): string {
  if (mode === "handoff") return "AI handoff";
  if (mode === "packets") return "Route packets";
  if (mode === "components") return "Component candidates";
  if (mode === "owners") return "Component owners";
  if (mode === "bindings") return "Behavior bindings";
  if (mode === "behavior") return "Behavior files";
  if (mode === "blockers") return "Conversion blockers";
  return "Route candidates";
}

function AiHandoffPanelContent({ map }: { map: ReactConversionMap }) {
  const handoff = map.aiHandoff;
  return (
    <>
      <div className="dead-code-row ai-handoff-summary">
        <div>
          <strong>{handoff.status} · {handoff.confidence}</strong>
          <span>{handoff.summary}</span>
        </div>
      </div>

      {handoff.primaryRoute ? (
        <div className="dead-code-row">
          <div>
            <strong>{handoff.primaryRoute.routePath}</strong>
            <span>
              {handoff.primaryRoute.sourceFile} · routes/{handoff.primaryRoute.packetSlug}.json ·{" "}
              {handoff.primaryRoute.componentOwners.toLocaleString()} owners ·{" "}
              {handoff.primaryRoute.behaviorBindings.toLocaleString()} behaviors
            </span>
          </div>
        </div>
      ) : null}

      {handoff.steps.map((step) => (
        <div className="dead-code-row" key={step.title}>
          <div>
            <strong>{step.title}</strong>
            <span>{step.detail}</span>
            <small className="handoff-facts">{step.facts.join(" · ")}</small>
          </div>
        </div>
      ))}

      <div className="dead-code-row">
        <div>
          <strong>Prompt facts</strong>
          <span>{handoff.promptFacts.join(" · ")}</span>
        </div>
      </div>
    </>
  );
}

function routePacketSummary(packet: ReactConversionMap["routePackets"][number]): string {
  return [
    packet.sourceFile,
    packet.pageComponentName,
    `${packet.componentOwners.length.toLocaleString()} owners`,
    `${packet.behaviorBindings.length.toLocaleString()} behaviors`,
    `${packet.cssSelectors.length.toLocaleString()} CSS`,
    `${packet.blockers.length.toLocaleString()} blockers`,
  ].join(" · ");
}

function componentOwnerSummary(owner: ReactConversionMap["componentOwnership"][number]): string {
  const firstLocator = owner.locators[0];
  return [
    owner.confidence,
    owner.selector,
    firstLocator ? `${firstLocator.sourceFile}:${firstLocator.lineStart}-${firstLocator.lineEnd}` : "",
    `${owner.routesUsedIn.length.toLocaleString()} routes`,
    `${owner.cssSelectors.length.toLocaleString()} CSS`,
    `${owner.behaviorBindings.length.toLocaleString()} behaviors`,
    `${owner.assets.length.toLocaleString()} assets`,
    `${owner.locators.length.toLocaleString()} locators`,
  ].filter(Boolean).join(" · ");
}

function behaviorBindingSummary(binding: ReactConversionMap["behaviorBindings"][number]): string {
  return [
    binding.confidence,
    binding.componentName,
    binding.kind,
    binding.event,
    binding.effects.join(", ") || "event binding",
    binding.targets.slice(0, 2).join(", "),
    binding.endpoints.slice(0, 2).join(", "),
    `${binding.sourceFile}:${binding.line}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
