import { Button } from "@/components/ui/button";
import type { RepoScanReport } from "../types";

interface CompactHeaderProps {
  report: RepoScanReport;
  onExport: () => void;
  onRescan: () => void;
}

export function CompactHeader({ report, onExport, onRescan }: CompactHeaderProps) {
  return (
    <header className="grid min-h-[52px] grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2 shadow-sm max-[700px]:grid-cols-[1fr_auto]">
      <strong className="text-sm font-semibold max-[700px]:hidden">Fixer</strong>
      <div className="min-w-0" title={report.repoPath}>
        <strong className="block truncate text-sm font-semibold leading-tight">{report.repoName}</strong>
        <span className="block truncate text-[11px] text-muted-foreground">{shortenPath(report.repoPath)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onRescan}>Rescan</Button>
        <Button type="button" size="sm" onClick={onExport}>Export</Button>
      </div>
    </header>
  );
}

function shortenPath(repoPath: string) {
  const parts = repoPath.split("/").filter(Boolean);
  if (parts.length <= 4) return repoPath;
  return ".../" + parts.slice(-3).join("/");
}
