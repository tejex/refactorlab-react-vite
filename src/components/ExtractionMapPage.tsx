import { useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import { Card, CardContent, Chip, Drawer, IconButton } from "@mui/material";
import type { GuaranteedSafeChange, InlineAssetPlan, ProjectReport } from "../scanner/types";

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

      {visibleGroups.length ? (
        <>
          {unchangedCount > 0 ? (
            <p className="unchanged-note">{unchangedCount.toLocaleString()} source file(s) unchanged by parser.</p>
          ) : null}
          <section className="map-flow-list">
            {visibleGroups.map((group) => (
            <SourceFileMap
              key={group.file}
              group={group}
              isSelected={selectedGroup?.file === group.file}
              onSelect={() => setSelectedGroup(group)}
            />
          ))}
          </section>
        </>
      ) : (
        <section className="map-empty">
          <h2>No file splits proposed</h2>
          <p>The parser did not produce multi-file extraction plans for this project.</p>
        </section>
      )}

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

function MetricStrip({ plan, sourceCount, proposedCount }: { plan?: InlineAssetPlan; sourceCount: number; proposedCount: number }) {
  const inlineBlocks = plan?.blocks.length ?? 0;
  const safeCount = plan?.guaranteedSafeChanges.length ?? 0;

  return (
    <section className="map-metrics">
      <MetricPill label="source files" value={sourceCount} />
      <MetricPill label="inline blocks" value={inlineBlocks} />
      <MetricPill label="guaranteed safe" value={safeCount} />
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

function SourceFileMap({
  group,
  isSelected,
  onSelect,
}: {
  group: SafeChangeGroup;
  isSelected: boolean;
  onSelect: () => void;
}) {
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

function ProposedFilesDrawer({ group, onClose }: { group: SafeChangeGroup | null; onClose: () => void }) {
  const proposedFiles = group ? new Set(group.changes.map((change) => change.targetPath)).size : 0;

  return (
    <Drawer anchor="right" open={Boolean(group)} onClose={onClose} slotProps={{ paper: { className: "proposed-drawer" } }}>
      {group ? (
        <section className="proposed-panel">
          <header className="proposed-panel-head">
            <div>
              <span>Parser output</span>
              <h2>{shortFileName(group.file)}</h2>
            </div>
            <IconButton aria-label="Close proposed files panel" onClick={onClose}>
              <CloseRoundedIcon />
            </IconButton>
          </header>

          <section className="comparison-card new-version">
            <div className="comparison-head">
              <span>New parser structure</span>
              <strong>{folderName(group.changes)}/</strong>
            </div>
            <div className="mini-stats">
              <Chip label={`${proposedFiles.toLocaleString()} files`} size="small" />
              <Chip label="copy-only proposal" size="small" />
            </div>
            <GeneratedTree changes={group.changes} />
          </section>

          <section className="comparison-card original-version">
            <div className="comparison-head">
              <span>Current source</span>
              <strong>{shortFileName(group.file)}</strong>
            </div>
            <div className="mini-stats">
              <Chip label="1 file" size="small" />
              <Chip label={`${group.sourceLines.toLocaleString()} lines`} size="small" />
            </div>
            <div className="original-file-block">
              <InsertDriveFileRoundedIcon />
              <span>{shortFileName(group.file)}</span>
            </div>
          </section>
        </section>
      ) : null}
    </Drawer>
  );
}

function GeneratedTree({ changes }: { changes: GuaranteedSafeChange[] }) {
  const root = buildGeneratedTree(changes);

  return (
    <ol className="generated-tree">
      {root.children.map((node) => (
        <TreeNodeView key={node.path} node={node} />
      ))}
    </ol>
  );
}

function TreeNodeView({ node }: { node: GeneratedTreeNode }) {
  return (
    <li className={node.kind === "folder" ? "tree-folder" : "tree-file"}>
      <div className="tree-node-row">
        <strong>{node.name}</strong>
      </div>
      {node.children.length > 0 ? (
        <ol>
          {node.children.map((child) => (
            <TreeNodeView key={child.path} node={child} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

interface SafeChangeGroup {
  file: string;
  changes: GuaranteedSafeChange[];
  totalLines: number;
  sourceLines: number;
}

interface GeneratedTreeNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: GeneratedTreeNode[];
  change?: GuaranteedSafeChange;
}

function groupSafeChanges(changes: GuaranteedSafeChange[]): SafeChangeGroup[] {
  const groups = new Map<string, GuaranteedSafeChange[]>();
  for (const change of changes) {
    groups.set(change.file, [...(groups.get(change.file) ?? []), change]);
  }

  return [...groups.entries()]
    .map(([file, groupChanges]) => ({
      file,
      changes: groupChanges.sort((a, b) => a.lineStart - b.lineStart),
      totalLines: groupChanges.reduce((total, change) => total + (change.lineEnd - change.lineStart + 1), 0),
      sourceLines: groupChanges[0]?.sourceLines ?? 0,
    }))
    .sort((a, b) => b.totalLines - a.totalLines || a.file.localeCompare(b.file));
}

function buildGeneratedTree(changes: GuaranteedSafeChange[]): GeneratedTreeNode {
  const root: GeneratedTreeNode = { name: "/", path: "", kind: "folder", children: [] };

  for (const change of changes) {
    const parts = change.targetPath.replace(/^\/+/, "").split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = [...parts.slice(0, index), part].join("/");
      const isFile = index === parts.length - 1;
      let child = current.children.find((node) => node.name === part);

      if (!child) {
        child = {
          name: part,
          path,
          kind: isFile ? "file" : "folder",
          children: [],
        };
        current.children.push(child);
      }

      if (isFile) {
        child.change = change;
      }

      current = child;
    });
  }

  sortGeneratedTree(root);
  return root;
}

function sortGeneratedTree(node: GeneratedTreeNode) {
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  node.children.forEach(sortGeneratedTree);
}

function shortFileName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function folderName(changes: GuaranteedSafeChange[]): string {
  const firstPath = changes[0]?.targetPath ?? "folder";
  return firstPath.replace(/^\/+/, "").split("/").filter(Boolean)[0] ?? "folder";
}

function proposedFileCountFor(group: SafeChangeGroup): number {
  return new Set(group.changes.map((change) => change.targetPath)).size;
}
