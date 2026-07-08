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

type TokenLabelTone = "danger" | "success" | "highlight";

interface TokenLabelProps {
  label: string;
  value: number;
  tone: TokenLabelTone;
}

interface InfoTooltipProps {
  text: string;
}

const tokenLabelStyles: Record<TokenLabelTone, { text: string; bar: string }> = {
  danger: {
    text: "text-orange-500",
    bar: "bg-orange-500",
  },
  success: {
    text: "text-emerald-500",
    bar: "bg-emerald-500",
  },
  highlight: {
    text: "text-violet-500",
    bar: "bg-violet-500",
  },
};

const getWasteBadgeStyles = (percent: number) => {
  if (percent >= 70) {
    return "border-red-500/25 bg-red-500/10 text-red-500";
  }

  if (percent >= 45) {
    return "border-orange-500/25 bg-orange-500/10 text-orange-500";
  }

  if (percent >= 25) {
    return "border-yellow-500/25 bg-yellow-500/10 text-yellow-500";
  }

  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-500";
};

const getWasteBadge = (percent: number) => {
  if (percent >= 70) return "High waste";
  if (percent >= 45) return "Moderate waste";
  if (percent >= 25) return "Some waste";

  return "Low waste";
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

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

  const wastePercent = Math.round(
    sourceTokens > 0
      ? clampPercent((potentialTokensSaved / sourceTokens) * 100)
      : clampPercent(contextReductionPercent),
  );

  const wasteBadge = getWasteBadge(wastePercent);
  const wasteBadgeStyles = getWasteBadgeStyles(wastePercent);

  return (
    <Card className="overflow-hidden shadow-sm" aria-label="Potential token waste">
      <CardContent className="grid min-h-[170px] gap-4 p-4">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-4 max-[700px]:grid-cols-1">
          <div className="grid content-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">
                Potentially Avoidable AI Context
              </span>

              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${wasteBadgeStyles}`}
              >
                {wasteBadge}
              </span>

              <InfoTooltip text="Estimated repo context that may not need to be sent to the AI after Fixer tightens the input." />
            </div>

            <strong className="truncate text-[34px] font-semibold leading-none tracking-normal text-violet-500">
              {compactNumber(potentialTokensSaved)} tokens
            </strong>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Fixer estimates {wastePercent}% of this repo pass may be unnecessary for the AI.
            </p>
          </div>

          <div className="grid content-center gap-3">
            <Progress
              value={wastePercent}
              segmentCount={44}
              className="h-7"
              aria-label="Potential AI context savings from using Fixer"
            />
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <LegendItem
              colorClassName="bg-violet-500"
              label={`${wastePercent}% unnecessary context`}
            />
            <LegendItem
              colorClassName="bg-zinc-800/70"
              label={`${100 - wastePercent}% still needed`}
            />
          </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 max-[700px]:grid-cols-1">
          <TokenLabel label="Without Fixer" value={sourceTokens} tone="danger" />
          <TokenLabel label="After Fixer" value={compactContextTokens} tone="success" />
          <TokenLabel label="Avoided by Fixer" value={potentialTokensSaved} tone="highlight" />
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

const getSavingsGradient = (percent: number) => {
  if (percent >= 70) {
    return "bg-gradient-to-r from-violet-500 to-fuchsia-500";
  }

  if (percent >= 45) {
    return "bg-gradient-to-r from-blue-500 to-violet-500";
  }

  if (percent >= 25) {
    return "bg-gradient-to-r from-emerald-500 to-blue-500";
  }

  return "bg-gradient-to-r from-zinc-500 to-emerald-500";
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