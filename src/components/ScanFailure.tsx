import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ScanFailureProps {
  busy: boolean;
  canRetry: boolean;
  error: string | null;
  hasPreviousReport: boolean;
  onChooseAnother: () => void;
  onRetry: () => void;
  onUsePrevious: () => void;
}

export function ScanFailure({
  busy,
  canRetry,
  error,
  hasPreviousReport,
  onChooseAnother,
  onRetry,
  onUsePrevious,
}: ScanFailureProps) {
  return (
    <section className="grid min-h-screen place-items-center p-4" aria-live="assertive">
      <Card className="w-full max-w-[460px] shadow-utility">
        <CardContent className="grid gap-4 p-5">
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
              Scan incomplete
            </p>
            <h1 className="text-xl font-semibold">Fixer could not finish this scan</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {error ?? "No new report was published."}
              {hasPreviousReport
                ? " Your previous completed report is still available."
                : " Try the scan again or choose another repository."}
            </p>
          </div>

          <details className="rounded-md border bg-background/50 px-3 py-2 text-[13px] text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">
              Details
            </summary>
            <p className="pt-2 leading-relaxed">
              Fixer stopped before publishing a replacement report, so incomplete scan data is not shown.
            </p>
          </details>

          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <Button type="button" disabled={busy} onClick={onRetry}>Retry scan</Button>
            ) : null}
            <Button type="button" variant="secondary" disabled={busy} onClick={onChooseAnother}>
              Choose another repository
            </Button>
            {hasPreviousReport ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={onUsePrevious}>
                View previous report
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
