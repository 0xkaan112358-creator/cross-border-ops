import { addDays } from "./dates";

/**
 * A run of k zero-sales days is treated as out of stock when, at the SKU's normal selling rate λ, selling nothing
 * for k days would happen less than ~2% of the time under a Poisson model: P = e^(-kλ) < 0.02 ⇔ kλ ≥ 4.
 * Example: at 2 units/day, 2 empty days are already a stockout; at 0.2 units/day it takes 20.
 */
export const STOCKOUT_EXPECTED_UNITS = 4;

export type StockoutInference = {
  /** Dates (YYYY-MM-DD) inferred as out of stock. */
  days: string[];
  /** Normal daily rate on in-stock days, used for the decision. */
  rate: number;
};

/**
 * Infers out-of-stock days from daily sales alone, for sources (such as ERP order history) that do not record
 * daily stock levels. Days are [start, end); missing dates count as zero sales.
 * `sellableNow` is the current FBA sellable stock: when it is 0, the zero run reaching `end` is a stockout regardless
 * of its length.
 */
export function inferStockoutDays(
  unitsByDate: Map<string, number>,
  start: string,
  end: string,
  sellableNow: number,
): StockoutInference {
  const dates: string[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) dates.push(d);
  const units = dates.map((d) => Math.max(0, unitsByDate.get(d) ?? 0));
  const total = units.reduce((a, b) => a + b, 0);
  if (total === 0 || dates.length === 0) return { days: [], rate: 0 };

  const runs: { from: number; to: number }[] = [];
  for (let i = 0; i < units.length; ) {
    if (units[i] > 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < units.length && units[j] === 0) j++;
    runs.push({ from: i, to: j });
    i = j;
  }

  const flagged = new Set<number>();
  const trailing = runs.find((r) => r.to === units.length);
  if (trailing && sellableNow <= 0) flagged.add(runs.indexOf(trailing));

  // Removing flagged runs raises the in-stock rate, which can flag more runs; iterate until stable.
  let rate = 0;
  for (let iter = 0; iter < 10; iter++) {
    const excluded = [...flagged].reduce((a, i) => a + (runs[i].to - runs[i].from), 0);
    rate = total / Math.max(1, dates.length - excluded);
    let changed = false;
    runs.forEach((r, i) => {
      if (!flagged.has(i) && (r.to - r.from) * rate >= STOCKOUT_EXPECTED_UNITS) {
        flagged.add(i);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const days: string[] = [];
  for (const i of [...flagged].sort((a, b) => a - b)) for (let k = runs[i].from; k < runs[i].to; k++) days.push(dates[k]);
  return { days, rate: Math.round(rate * 100) / 100 };
}
