import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  error: string | null;
  onChoose: () => void;
}

export function EmptyState({ error, onChoose }: EmptyStateProps) {
  return (
    <section className="grid min-h-screen place-items-center p-4" aria-live="polite">
      <Card className="w-full max-w-[380px] shadow-utility">
        <CardContent className="grid gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">Fx</div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight">Fixer</h1>
              <p className="text-xs text-muted-foreground">Local AI coding cost estimator</p>
            </div>
          </div>

          <Button type="button" onClick={onChoose}>
            Choose Project Folder
          </Button>

          {error ? <p className="text-xs leading-relaxed text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
