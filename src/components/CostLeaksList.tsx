import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { CostDriver, Totals } from "../types";
import { costFocusedDriver } from "./costCopy";

interface CostLeaksListProps {
  drivers: CostDriver[];
  totals: Totals;
}

export function CostLeaksList({ drivers, totals }: CostLeaksListProps) {
  return (
    <Card className="min-h-[150px]">
      <CardHeader className="px-3 py-2.5">
        <CardTitle>Cost Leaks</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="grid">
          {drivers.slice(0, 3).map((driver, index) => {
            const display = costFocusedDriver(driver, totals);
            return (
              <div key={driver.title + driver.explanation}>
                {index > 0 ? <Separator /> : null}
                <article className="grid min-h-[43px] grid-cols-[22px_minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 max-[700px]:grid-cols-[22px_minmax(0,1fr)_auto]">
                  <span className="self-start pt-0.5 text-xs font-bold text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold leading-tight">{display.title}</strong>
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">{display.explanation}</p>
                  </div>
                  {display.affectedLabel ? <small className="whitespace-nowrap text-[11px] text-muted-foreground max-[700px]:hidden">{display.affectedLabel}</small> : null}
                  <Badge variant={display.severity}>{display.severity}</Badge>
                </article>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
