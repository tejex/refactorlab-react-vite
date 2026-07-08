import type { CostDriver, Totals } from "../types";
import { costFocusedDriver } from "./costCopy";

interface CompactCostDriversProps {
  drivers: CostDriver[];
  totals: Totals;
}

export function CompactCostDrivers({ drivers, totals }: CompactCostDriversProps) {
  return (
    <section className="compact-drivers">
      <h2>Top Cost Drivers</h2>
      <div className="driver-rows">
        {drivers.slice(0, 3).map((driver, index) => {
          const display = costFocusedDriver(driver, totals);
          return (
            <article className="driver-row" key={`${driver.title}-${driver.explanation}`}>
              <span className="driver-index">{index + 1}.</span>
              <div className="driver-copy">
                <strong>{display.title}</strong>
                <p>{display.explanation}</p>
              </div>
              {display.affectedLabel ? <small>{display.affectedLabel}</small> : null}
              <span className={`severity-badge ${display.severity}`}>{display.severity}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
