import type { RepoScanReport } from "../types";

interface CompactHeaderProps {
  report: RepoScanReport;
  onExport: () => void;
  onRescan: () => void;
}

export function CompactHeader({ report, onExport, onRescan }: CompactHeaderProps) {
  return (
    <header className="compact-header">
      <strong className="wordmark">Fixer</strong>
      <div className="repo-summary" title={report.repoPath}>
        <strong>{report.repoName}</strong>
        <span>{shortenPath(report.repoPath)}</span>
      </div>
      <div className="header-actions">
        <button type="button" className="secondary-action" onClick={onRescan}>Rescan</button>
        <button type="button" className="primary-action" onClick={onExport}>Export</button>
      </div>
    </header>
  );
}

function shortenPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 4) return path;
  return `.../${parts.slice(-3).join("/")}`;
}
