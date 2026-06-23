import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import { Chip, Drawer, IconButton } from "@mui/material"
import type { GuaranteedSafeChange } from "../scanner/types"
import { buildGeneratedTree, folderName, shortFileName, type GeneratedTreeNode, type SafeChangeGroup } from "./extractionMapUtils"

export function ProposedFilesDrawer({ group, onClose }: { group: SafeChangeGroup | null; onClose: () => void }) {
  const proposedFiles = group ? new Set(group.changes.map((change) => change.targetPath)).size : 0

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
  )
}

function GeneratedTree({ changes }: { changes: GuaranteedSafeChange[] }) {
  const root = buildGeneratedTree(changes);
  return (
    <ol className="generated-tree">
      {root.children.map((node) => (
        <TreeNodeView key={node.path} node={node} />
      ))}
    </ol>
  )
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
  )
}
