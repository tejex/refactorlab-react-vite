import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Scores } from "../types";

interface RiskSummaryRowProps {
  aiCostRisk: number;
  privacyRisk: Scores["privacyRisk"];
  retryRisk: Scores["retryRisk"];
}

type RiskTone = "good" | "warn" | "bad";

interface RiskCardProps {
  explanation: string;
  label: string;
  tone: RiskTone;
  value: string;
}

const riskCardStyles: Record<
  RiskTone,
  {
    card: string;
    dot: string;
    value: string;
    badge: string;
  }
> = {
  good: {
    card: "border-emerald-500/15 bg-emerald-500/[0.03]",
    dot: "bg-emerald-500",
    value: "text-emerald-500",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  },
  warn: {
    card: "border-orange-500/20 bg-orange-500/[0.04]",
    dot: "bg-orange-500",
    value: "text-orange-500",
    badge: "border-orange-500/20 bg-orange-500/10 text-orange-500",
  },
  bad: {
    card: "border-red-500/20 bg-red-500/[0.04]",
    dot: "bg-red-500",
    value: "text-red-500",
    badge: "border-red-500/20 bg-red-500/10 text-red-500",
  },
};

export const RiskSummaryRow = ({
  aiCostRisk,
  privacyRisk,
  retryRisk,
}: RiskSummaryRowProps) => (
  <section
    className="grid grid-cols-3 gap-2 max-[500px]:grid-cols-1"
    aria-label="Risk summary"
  >
    <RiskCard
      label="AI Cost Pressure"
      value={`${oneDecimal(aiCostRisk)}/10`}
      tone={scoreTone(aiCostRisk)}
      explanation="How likely this repo is to use extra AI tokens because of large context, ambiguity, verification gaps, or risky files."
    />

    <RiskCard
      label="Retry Loop Risk"
      value={retryRisk}
      tone={riskTone(retryRisk)}
      explanation="How likely the AI is to need repeated attempts because tests, typecheck, build, CI, or repo signals are missing."
    />

    <RiskCard
      label="Sensitive Data Risk"
      value={privacyRisk}
      tone={riskTone(privacyRisk)}
      explanation="How likely this repo contains .env files, secret-like strings, private URLs, or internal data that should be filtered before AI use."
    />
  </section>
);

const RiskCard = ({ explanation, label, tone, value }: RiskCardProps) => {
  const styles = riskCardStyles[tone];

  return (
    <Card className={`overflow-hidden shadow-sm ${styles.card}`}>
      <CardContent className="flex min-h-[72px] items-center justify-between gap-3 p-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />

            <span className="truncate text-[10px] font-bold uppercase text-muted-foreground">
              {label}
            </span>

            <InfoTooltip text={explanation} />
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${styles.badge}`}
            >
              {toneLabel(tone)}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <strong
              className={`block truncate text-l font-semibold leading-tight`}
            >
              {value}
            </strong>

          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const InfoTooltip = ({ text }: { text: string }) => (
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

const oneDecimal = (value: number) => value.toFixed(1).replace(".0", "");

const riskTone = (risk: "Low" | "Medium" | "High"): RiskTone => {
  if (risk === "High") return "bad";
  if (risk === "Medium") return "warn";

  return "good";
};

const scoreTone = (score: number): RiskTone => {
  if (score >= 7) return "bad";
  if (score >= 4) return "warn";

  return "good";
};

const toneLabel = (tone: RiskTone) => {
  if (tone === "bad") return "High";
  if (tone === "warn") return "Watch";

  return "Clear";
};