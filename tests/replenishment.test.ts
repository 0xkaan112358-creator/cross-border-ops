import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { computePlan, promoFactor, roundToPack, type InventoryInput, type Promotion, type SalesPoint, type SkuInput } from "@/lib/replenishment";
import { DEFAULT_REPLENISHMENT } from "@/lib/settings-defaults";

const TODAY = "2026-06-30";

// Lead time 20 + 30 + 10 = 60 days; sea leg 40 days; air leg 20 days.
const sku: SkuInput = {
  id: 1,
  sku: "TEST-1",
  marketplace: "US",
  name: "测试商品",
  unit_cost: 10,
  case_pack: 24,
  moq: 100,
  production_days: 20,
  sea_days: 30,
  air_days: 10,
  receiving_days: 10,
};

const emptyInv: InventoryInput = { fba_available: 0, fba_inbound: 0, in_transit: 0, overseas_wh: 0, domestic_wh: 0, in_production: 0, aged_qty: 0 };

/** One point per day for the last `days` days; `fn(i)` gets i = 1 for yesterday. */
function series(days: number, fn: (i: number) => Partial<SalesPoint>): SalesPoint[] {
  return Array.from({ length: days }, (_, k) => {
    const i = k + 1;
    return { date: addDays(TODAY, -i), units: 0, in_stock: true, ...fn(i) };
  });
}

const steady = series(30, () => ({ units: 10 }));

describe("roundToPack", () => {
  it("rounds up to whole cartons and applies the minimum order quantity", () => {
    expect(roundToPack(0, 24, 100)).toBe(0);
    expect(roundToPack(740, 24, 100)).toBe(744);
    expect(roundToPack(10, 24, 100)).toBe(100);
    expect(roundToPack(10, 0, 0)).toBe(10);
  });
});

describe("promoFactor", () => {
  const promos: Promotion[] = [
    { name: "全站", marketplace: null, start_date: "2026-07-01", end_date: "2026-07-10", factor: 1.5 },
    { name: "美国站", marketplace: "US", start_date: "2026-07-05", end_date: "2026-07-06", factor: 2 },
  ];
  it("takes the largest factor among overlapping promotions of the marketplace", () => {
    expect(promoFactor("2026-07-05", "US", promos)).toBe(2);
    expect(promoFactor("2026-07-05", "DE", promos)).toBe(1.5);
    expect(promoFactor("2026-07-11", "US", promos)).toBe(1);
  });
});

describe("computePlan forecast", () => {
  it("leaves out-of-stock days out of the daily average instead of counting them as zero sales", () => {
    const withStockout = series(30, (i) => (i <= 5 ? { units: 0, in_stock: false } : { units: 10 }));
    const plan = computePlan(sku, emptyInv, withStockout, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.baseDaily).toBe(10);
    expect(plan.stockoutDays30).toBe(5);
    expect(plan.explanation).toContain("已剔除 5 天断货日");

    const zeroInStock = series(30, (i) => (i <= 5 ? { units: 0 } : { units: 10 }));
    const naive = computePlan(sku, emptyInv, zeroInStock, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(naive.baseDaily).toBeCloseTo(5, 0);
  });

  it("weights the 7/14/30-day averages 0.5/0.3/0.2", () => {
    const recentSpike = series(30, (i) => ({ units: i <= 7 ? 20 : 10 }));
    const plan = computePlan(sku, emptyInv, recentSpike, [], DEFAULT_REPLENISHMENT, TODAY);
    // avg7 = 20, avg14 = 15, avg30 = (7*20 + 23*10) / 30 = 12.33
    expect(plan.avg7).toBe(20);
    expect(plan.avg14).toBe(15);
    expect(plan.baseDaily).toBeCloseTo(0.5 * 20 + 0.3 * 15 + 0.2 * (370 / 30), 1);
  });

  it("divides promotion days by their factor so a past sale does not inflate the baseline", () => {
    const promos: Promotion[] = [{ name: "大促", marketplace: null, start_date: addDays(TODAY, -30), end_date: addDays(TODAY, -1), factor: 2 }];
    const plan = computePlan(sku, emptyInv, series(30, () => ({ units: 20 })), promos, DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.baseDaily).toBe(10);
    expect(plan.promoAdjustedDays30).toBe(30);
  });
});

describe("computePlan decisions", () => {
  it("orders target - pipeline, rounded to cartons, and suggests air freight when sea arrives too late", () => {
    const plan = computePlan(sku, { ...emptyInv, fba_available: 300 }, steady, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.status).toBe("stockout_risk");
    expect(plan.sellableDays).toBe(30);
    expect(plan.leadTime).toBe(60);
    // target = 10/day x (60 lead + 14 safety + 30 cover) = 1040; 1040 - 300 = 740 -> 31 cartons of 24
    expect(plan.targetQty).toBe(1040);
    expect(plan.orderRawQty).toBe(740);
    expect(plan.orderQty).toBe(744);
    expect(plan.orderDate).toBe(TODAY);
    // Sea stock lands on day 40 but stock runs out on day 30: air covers days 30-40 = 100 units -> 5 cartons
    expect(plan.airQty).toBe(120);
    expect(plan.unavoidableStockoutDays).toBe(0);
  });

  it("ships domestic stock first when overseas stock runs short", () => {
    const plan = computePlan(sku, { ...emptyInv, fba_available: 300, domestic_wh: 2000 }, steady, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.shipFromDomesticQty).toBeGreaterThan(0);
    expect(plan.shipFromDomesticQty).toBeLessThanOrEqual(2000);
  });

  it("is healthy with enough stock and schedules the next order", () => {
    const plan = computePlan(sku, { ...emptyInv, fba_available: 1200 }, steady, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.status).toBe("healthy");
    expect(plan.orderQty).toBe(0);
    // 120 days of stock - 60 lead - 14 safety
    expect(plan.daysUntilReorder).toBe(46);
    expect(plan.orderDate).toBe(addDays(TODAY, 46));
  });

  it("flags excess beyond lead + safety + cover + buffer and values it at unit cost", () => {
    const plan = computePlan(sku, { ...emptyInv, fba_available: 5000 }, steady, [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.status).toBe("excess");
    // keep 10/day x (60 + 14 + 30 + 45) = 1490
    expect(plan.excessQty).toBe(3510);
    expect(plan.excessValue).toBe(35100);
  });

  it("treats all stock as excess when the SKU has not sold", () => {
    const plan = computePlan(sku, { ...emptyInv, domestic_wh: 50 }, series(30, () => ({ units: 0 })), [], DEFAULT_REPLENISHMENT, TODAY);
    expect(plan.status).toBe("excess");
    expect(plan.excessQty).toBe(50);
  });
});
