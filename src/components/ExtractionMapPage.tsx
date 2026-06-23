import { useState } from "react";
import { Card, CardContent, Chip } from "@mui/material";
import type { InlineAssetPlan, ProjectReport } from "../scanner/types";
import { ProposedFilesDrawer } from "./ExtractionMapDrawer";
import { groupSafeChanges, proposedFileCountFor, shortFileName, type SafeChangeGroup } from "./extractionMapUtils";

interface ExtractionMapPageProps {
  report: ProjectReport;
  onBack: () => void;
}

export function ExtractionMapPage({ report, onBack }: ExtractionMapPageProps) {
  const plan = report.inlineAssetPlan;
  const safeChanges = plan?.guaranteedSafeChanges ?? [];
  const groups = groupSafeChanges(safeChanges);
  const visibleGroups = groups.filter((group) => proposedFileCountFor(group) > 1);
  const unchangedCount = groups.length - visibleGroups.length;
  const sourceCount = visibleGroups.length;
  const proposedCount = new Set(visibleGroups.flatMap((group) => group.changes.map((change) => change.targetPath))).size;
  const [selectedGroup, setSelectedGroup] = useState<SafeChangeGroup | null>(null);

  return (
    <main className="map-page">
      <header className="map-topbar">
        <div className="map-breadcrumb">
          <strong>fixer.ai</strong>
          <span>/</span>
          <span>{report.sourceName}</span>
          <span>/</span>
          <span>Extraction Map</span>
        </div>
        <div className="button-row">
          <button type="button" onClick={onBack}>
            Back to report
          </button>
        </div>
      </header>

      <section className="map-hero">
        <div>
          <h1>Extraction Map</h1>
          <p>line-exact parser output</p>
        </div>
        <span className="safe-pill">{safeChanges.length.toLocaleString()} copy-only</span>
      </section>

      <MetricStrip plan={plan} sourceCount={sourceCount} proposedCount={proposedCount} />
      <ExtractionMapBody groups={visibleGroups} unchangedCount={unchangedCount} selectedGroup={selectedGroup} onSelect={setSelectedGroup} />

      <footer className="map-footer">
        <span>copy-only / source unchanged</span>
        <div className="button-row">
          <button type="button" onClick={onBack}>
            Back to report
          </button>
        </div>
      </footer>

      <ProposedFilesDrawer group={selectedGroup} onClose={() => setSelectedGroup(null)} />
    </main>
  );
}

function ExtractionMapBody({
  groups,
  unchangedCount,
  selectedGroup,
  onSelect,
}: {
  groups: SafeChangeGroup[];
  unchangedCount: number;
  selectedGroup: SafeChangeGroup | null;
  onSelect: (group: SafeChangeGroup) => void;
}) {
  if (!groups.length) {
    return (
      <section className="map-empty">
        <h2>No file splits proposed</h2>
        <p>The parser did not produce multi-file extraction plans for this project.</p>
      </section>
    );
  }

  return (
    <>
      {unchangedCount > 0 ? <p className="unchanged-note">{unchangedCount.toLocaleString()} source file(s) unchanged by parser.</p> : null}
      <section className="map-flow-list">
        {groups.map((group) => (
          <SourceFileMap key={group.file} group={group} isSelected={selectedGroup?.file === group.file} onSelect={() => onSelect(group)} />
        ))}
      </section>
    </>
  );
}

function MetricStrip({ plan, sourceCount, proposedCount }: { plan?: InlineAssetPlan; sourceCount: number; proposedCount: number }) {
  return (
    <section className="map-metrics">
      <MetricPill label="source files" value={sourceCount} />
      <MetricPill label="inline blocks" value={plan?.blocks.length ?? 0} />
      <MetricPill label="guaranteed safe" value={plan?.guaranteedSafeChanges.length ?? 0} />
      <MetricPill label="proposed files" value={proposedCount} />
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <Card className="map-metric-pill" variant="outlined">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </Card>
  );
}

function SourceFileMap({ group, isSelected, onSelect }: { group: SafeChangeGroup; isSelected: boolean; onSelect: () => void }) {
  return (
    <button className="map-flow-row" type="button" onClick={onSelect}>
      <Card className={`extraction-card${isSelected ? " is-selected" : ""}`} variant="outlined">
        <CardContent>
          <div className="extraction-card-head">
            <div className="chip-row">
              <Chip label={`${group.changes.length.toLocaleString()} files`} size="small" />
              <Chip label="parser" size="small" />
            </div>
          </div>
          <div className="source-preview">
            <span>Source file</span>
            <strong>{shortFileName(group.file)}</strong>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
