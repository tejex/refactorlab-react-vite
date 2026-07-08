import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ScanProgress() {
  return (
    <section className="grid min-h-screen place-items-center p-4" aria-live="polite">
      <Card className="w-full max-w-[380px] shadow-utility">
        <CardContent className="grid gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 animate-pulse place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">Fx</div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Scanning</h1>
              <p className="text-xs text-muted-foreground">Reading local files and computing deterministic signals.</p>
            </div>
          </div>
          <Progress value={64} aria-label="Scan in progress" />
        </CardContent>
      </Card>
    </section>
  );
}
