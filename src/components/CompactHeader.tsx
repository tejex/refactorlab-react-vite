import { Button } from "@/components/ui/button";
import type { RepoScanReport } from "../types";

interface CompactHeaderProps {
  busy: boolean;
  report: RepoScanReport;
  onChooseAnother: () => void;
  onRescan: () => void;
}

export function CompactHeader({ busy, report, onChooseAnother, onRescan }: CompactHeaderProps) {
  return (
    <header className="flex min-h-[58px] items-center justify-between gap-4 rounded-lg border bg-card px-4 py-2.5 shadow-sm max-[620px]:flex-col max-[620px]:items-start">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-xs font-black text-primary-foreground">
          Fx
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Repository analyzed
          </p>
          <strong className="block max-w-[560px] break-words text-sm font-semibold leading-tight">
            {report.repoName}
          </strong>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onRescan}>
          Rescan repository
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onChooseAnother}>
          Choose another
        </Button>
      </div>
    </header>
  );
}
