import { Card, CardContent } from "@/components/ui/card";
export function ScanProgress() {
  return (
    <section className="grid min-h-screen place-items-center p-4" aria-live="polite">
      <Card className="w-full max-w-[420px] shadow-utility">
        <CardContent className="grid gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">Fx</div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Analyzing repository</h1>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Reading local files, building deterministic facts, and generating the repository packet.
              </p>
            </div>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Repository scan in progress"
          >
            <div className="scan-indeterminate h-full w-1/3 rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
