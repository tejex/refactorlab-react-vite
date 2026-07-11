import { Button } from "@/components/ui/button";

interface FooterActionsProps {
  exportMessage: string | null;
  onChooseAnother: () => void;
  onViewDetails: () => void;
}

export function FooterActions({ exportMessage, onChooseAnother, onViewDetails }: FooterActionsProps) {
  return (
    <footer className="flex min-h-9 items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onViewDetails}>View Report</Button>
      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">Estimates are based on deterministic repo signals. Actual token use depends on model, prompt, tools, cache, and task.</p>
      {exportMessage ? <span className="shrink-0 text-xs text-primary">{exportMessage}</span> : null}
      <Button type="button" variant="secondary" size="sm" onClick={onChooseAnother}>Choose Another Repo</Button>
    </footer>
  );
}
