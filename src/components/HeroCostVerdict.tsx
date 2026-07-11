import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { compactNumber } from "./costCopy";

interface HeroCostVerdictProps {
  compactContextTokens: number;
  contextReductionPercent: number;
  potentialTokensSaved: number;
  sourceTokens: number;
}

type TokenLabelTone = "broad" | "compact" | "highlight";

interface TokenLabelProps {
  label: string;
  value: number;
  tone: TokenLabelTone;
}

interface InfoTooltipProps {
  text: string;
}

const tokenLabelStyles: Record<TokenLabelTone, { text: string; bar: string }> = {
  broad: {
    text: "text-zinc-100",
    bar: "bg-zinc-500",
  },
  compact: {
    text: "text-zinc-300",
    bar: "bg-zinc-700",
  },
  highlight: {
    text: "text-violet-500",
    bar: "bg-violet-500",
  },
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const conservativePercent = (value: number, compactContextTokens: number) => {
  const percent = Math.floor(clampPercent(value));

  if (compactContextTokens > 0) {
    return Math.min(percent, 99);
  }

  return percent;
};

export const HeroCostVerdict = ({
  compactContextTokens,
  contextReductionPercent,
  potentialTokensSaved,
  sourceTokens,
}: HeroCostVerdictProps) => {
  const compactPercent =
    sourceTokens > 0
      ? clampPercent((compactContextTokens / sourceTokens) * 100)
      : 0;

  const avoidablePercent = conservativePercent(
    sourceTokens > 0
      ? (potentialTokensSaved / sourceTokens) * 100
      : contextReductionPercent,
    compactContextTokens,
  );

  return (
    <Card className="overflow-hidden shadow-sm" aria-label="Repo summary size check">
      <CardContent className="grid min-h-[170px] gap-4 p-4">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-4 max-[700px]:grid-cols-1">
          <div className="grid content-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">
                Repo Summary Size Check
              </span>

              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-400">
                {avoidablePercent}% smaller summary
              </span>

              <InfoTooltip text="How much smaller Fixer's repo summary is than the likely AI context." />
            </div>

            <strong className="truncate text-[34px] font-semibold leading-none tracking-normal text-violet-500">
              {compactNumber(potentialTokensSaved)} tokens
            </strong>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Fixer made a smaller repo summary from the files an AI would likely inspect first.
            </p>
          </div>

          <div className="grid content-center gap-3">
            <Progress
              value={avoidablePercent}
              segmentCount={44}
              className="h-7"
              aria-label="Repo summary size check"
            />
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <LegendItem
              colorClassName="bg-violet-500"
              label={`${avoidablePercent}% smaller summary`}
            />
            <LegendItem
              colorClassName="bg-zinc-800/70"
              label={`${100 - avoidablePercent}% kept in summary`}
            />
          </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 max-[700px]:grid-cols-1">
          <TokenLabel label="Likely AI context" value={sourceTokens} tone="broad" />
          <TokenLabel label="Fixer summary" value={compactContextTokens} tone="compact" />
          <TokenLabel label="Tokens saved in summary" value={potentialTokensSaved} tone="highlight" />
        </div>
      </CardContent>
    </Card>
  );
};

const TokenLabel = ({ label, value, tone }: TokenLabelProps) => {
  const styles = tokenLabelStyles[tone];

  return (
    <div className="relative min-w-0 overflow-hidden rounded-md border bg-background/55 px-3 py-2">
      <span className={`absolute left-0 top-0 h-full w-1 ${styles.bar}`} />

      <span className="block truncate text-[10px] font-bold uppercase text-muted-foreground">
        {label}
      </span>

      <strong className={`block truncate text-base font-semibold ${styles.text}`}>
        {compactNumber(value)}
      </strong>
    </div>
  );
};


const LegendItem = ({
  colorClassName,
  label,
}: {
  colorClassName: string;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5 truncate">
    <i className={`h-2 w-2 shrink-0 rounded-full ${colorClassName}`} />
    {label}
  </span>
);

const InfoTooltip = ({ text }: InfoTooltipProps) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="grid h-4 w-4 place-items-center rounded-full border text-[10px] font-bold text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={text}
        >
          i
        </button>
      </TooltipTrigger>

      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
