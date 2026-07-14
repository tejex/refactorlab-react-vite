import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  busy: boolean;
  onChoose: () => void;
}

export function EmptyState({ busy, onChoose }: EmptyStateProps) {
  return (
    <section className="grid min-h-screen place-items-center p-4" aria-live="polite">
      <Card className="w-full max-w-[460px] shadow-utility">
        <CardContent className="grid gap-5 p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">Fx</div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Fixer</h1>
              <p className="text-[13px] text-muted-foreground">Local repository context preparation</p>
            </div>
          </div>

          <div className="grid gap-2">
            <h2 className="text-xl font-semibold">Prepare a repository for AI</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Select a local repository to generate a compact, AI-readable context packet.
            </p>
          </div>

          <Button type="button" disabled={busy} onClick={onChoose}>
            {busy ? "Opening…" : "Choose repository"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
