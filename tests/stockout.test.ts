import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { inferStockoutDays } from "@/lib/stockout";

const START = "2026-01-01";
const END = addDays(START, 60);

/** units[i] is sold on START + i. */
function byDate(units: number[]) {
  return new Map(units.map((u, i) => [addDays(START, i), u] as [string, number]).filter(([, u]) => u > 0));
}

describe("inferStockoutDays", () => {
  it("finds nothing without sales", () => {
    expect(inferStockoutDays(new Map(), START, END, 0).days).toEqual([]);
  });

  it("flags a short gap in a steady seller", () => {
    const units = Array.from({ length: 60 }, (_, i) => (i >= 20 && i < 23 ? 0 : 5));
    const r = inferStockoutDays(byDate(units), START, END, 100);
    expect(r.days).toEqual([addDays(START, 20), addDays(START, 21), addDays(START, 22)]);
    expect(r.rate).toBe(5);
  });

  it("does not flag the normal gaps of a slow seller", () => {
    // One unit every third day: gaps of 2 days at ~0.33/day are expected.
    const units = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    expect(inferStockoutDays(byDate(units), START, END, 10).days).toEqual([]);
  });

  it("flags the trailing gap when FBA has no sellable stock, however short", () => {
    const units = Array.from({ length: 60 }, (_, i) => (i === 59 ? 0 : 1));
    expect(inferStockoutDays(byDate(units), START, END, 0).days).toEqual([addDays(START, 59)]);
    expect(inferStockoutDays(byDate(units), START, END, 30).days).toEqual([]);
  });

  it("re-estimates the rate after removing long gaps, which can expose shorter ones", () => {
    // 2/day, a 30-day gap and a 3-day gap. With all 60 days the rate is 0.9 and 3 days look normal (2.7 < 4);
    // without the 30-day gap the rate is 1.8 and the 3-day gap is a stockout (5.4 >= 4).
    const units = Array.from({ length: 60 }, (_, i) => ((i >= 10 && i < 40) || (i >= 50 && i < 53) ? 0 : 2));
    const r = inferStockoutDays(byDate(units), START, END, 100);
    expect(r.days).toHaveLength(33);
    expect(r.days).toContain(addDays(START, 51));
  });
});
