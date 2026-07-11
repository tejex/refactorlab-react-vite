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
  aiEligibleRepositoryTokens: number;
  potentialInputTokenReductionPercent: number;
  potentiallyAvoidableContextTokens: number;
  repositoryPacketTokens: number;
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

const conservativePercent = (value: number, repositoryPacketTokens: number) => {
  const percent = Math.floor(clampPercent(value));

  if (repositoryPacketTokens > 0) {
    return Math.min(percent, 99);
  }

  return percent;
};

export const HeroCostVerdict = ({
  aiEligibleRepositoryTokens,
  potentialInputTokenReductionPercent,
  potentiallyAvoidableContextTokens,
  repositoryPacketTokens,
}: HeroCostVerdictProps) => {
  const avoidablePercent = conservativePercent(
    aiEligibleRepositoryTokens > 0
      ? (potentiallyAvoidableContextTokens / aiEligibleRepositoryTokens) * 100
      : potentialInputTokenReductionPercent,
    repositoryPacketTokens,
  );

  return (
    <Card className="overflow-hidden shadow-sm" aria-label="Unified token accounting">
      <CardContent className="grid min-h-[170px] gap-4 p-4">
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-4 max-[700px]:grid-cols-1">
          <div className="grid content-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">
                Potentially Avoidable Context
              </span>

              <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-400">
                {avoidablePercent}% potential input-token reduction
              </span>

              <InfoTooltip text="AI-eligible repository tokens minus the final repository-packet tokens, counted with the same tokenizer." />
            </div>

            <strong className="truncate text-[34px] font-semibold leading-none tracking-normal text-violet-500">
              {compactNumber(potentiallyAvoidableContextTokens)} tokens
            </strong>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Potential context avoided when the repository packet is used instead of loading all AI-eligible repository files.
            </p>
          </div>

          <div className="grid content-center gap-3">
            <Progress
              value={avoidablePercent}
              segmentCount={44}
              className="h-7"
              aria-label="Potential input-token reduction"
            />
          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <LegendItem
              colorClassName="bg-violet-500"
              label={`${avoidablePercent}% potential input-token reduction`}
            />
            <LegendItem
              colorClassName="bg-zinc-800/70"
              label={`${100 - avoidablePercent}% represented by packet`}
            />
          </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 max-[700px]:grid-cols-1">
          <TokenLabel label="AI-eligible repository context" value={aiEligibleRepositoryTokens} tone="broad" />
          <TokenLabel label="Repository-packet tokens" value={repositoryPacketTokens} tone="compact" />
          <TokenLabel label="Potentially avoidable context" value={potentiallyAvoidableContextTokens} tone="highlight" />
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
