import type { StockStatus } from "./constants";
import { addDays } from "./dates";

export type SkuInput = {
  id: number;
  sku: string;
  marketplace: string;
  name: string;
  unit_cost: number;
  case_pack: number;
  moq: number;
  production_days: number;
  sea_days: number;
  air_days: number;
  receiving_days: number;
};

export type InventoryInput = {
  fba_available: number;
  fba_inbound: number;
  in_transit: number;
  overseas_wh: number;
  domestic_wh: number;
  in_production: number;
  aged_qty: number;
};

export type SalesPoint = { date: string; units: number; in_stock: boolean };

export type Promotion = {
  id?: number;
  name: string;
  marketplace: string | null;
  start_date: string;
  end_date: string;
  factor: number;
};

export type PlanSettings = {
  safetyDays: number;
  coverDays: number;
  excessBufferDays: number;
  agedShareThreshold: number;
  weights: [number, number, number];
};

export type ReplenishmentPlan = {
  status: StockStatus;
  avg7: number | null;
  avg14: number | null;
  avg30: number | null;
  stockoutDays30: number;
  promoAdjustedDays30: number;
  baseDaily: number;
  forecastDaily30: number;
  sellable: number;
  pipeline: number;
  sellableDays: number | null;
  pipelineDays: number | null;
  leadTime: number;
  seaLead: number;
  airLead: number;
  safetyDays: number;
  coverDays: number;
  targetQty: number;
  orderQty: number;
  orderRawQty: number;
  orderDate: string | null;
  daysUntilReorder: number | null;
  shipFromDomesticQty: number;
  airQty: number;
  unavoidableStockoutDays: number;
  excessQty: number;
  excessValue: number;
  upcomingPromos: { name: string; start_date: string; end_date: string; factor: number }[];
  reasons: string[];
  explanation: string;
};

const MAX_HORIZON = 365;

export function promoFactor(date: string, marketplace: string, promos: Promotion[]): number {
  let factor = 1;
  for (const p of promos) {
    if (p.marketplace && p.marketplace !== marketplace) continue;
    if (date >= p.start_date && date <= p.end_date) factor = Math.max(factor, Number(p.factor));
  }
  return factor;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function roundToPack(qty: number, casePack: number, moq: number): number {
  if (qty <= 0) return 0;
  const pack = Math.max(1, casePack);
  return Math.max(moq, Math.ceil(qty / pack) * pack);
}

export function computePlan(
  sku: SkuInput,
  inv: InventoryInput,
  sales: SalesPoint[],
  promos: Promotion[],
  settings: PlanSettings,
  today: string,
): ReplenishmentPlan {
  const byDate = new Map(sales.map((s) => [s.date, s]));
  let stockoutDays30 = 0;
  let promoAdjustedDays30 = 0;

  const windowAvg = (days: number): number | null => {
    let total = 0;
    let count = 0;
    for (let i = 1; i <= days; i++) {
      const date = addDays(today, -i);
      const point = byDate.get(date) ?? { date, units: 0, in_stock: true };
      if (!point.in_stock) continue;
      const f = promoFactor(date, sku.marketplace, promos);
      total += point.units / f;
      count++;
    }
    return count === 0 ? null : total / count;
  };

  for (let i = 1; i <= 30; i++) {
    const date = addDays(today, -i);
    if (byDate.get(date)?.in_stock === false) stockoutDays30++;
    if (promoFactor(date, sku.marketplace, promos) > 1) promoAdjustedDays30++;
  }

  const avg7 = windowAvg(7);
  const avg14 = windowAvg(14);
  const avg30 = windowAvg(30);
  const windows = [avg7, avg14, avg30];
  let weightSum = 0;
  let weighted = 0;
  windows.forEach((avg, i) => {
    if (avg == null) return;
    weighted += avg * settings.weights[i];
    weightSum += settings.weights[i];
  });
  const baseDaily = weightSum > 0 ? weighted / weightSum : 0;

  const forecast = (d: number) => baseDaily * promoFactor(addDays(today, d), sku.marketplace, promos);
  const demand = (from: number, to: number) => {
    let total = 0;
    for (let d = from; d < to; d++) total += forecast(d);
    return total;
  };
  const coverDays = (stock: number): number | null => {
    if (baseDaily <= 0) return null;
    let cum = 0;
    for (let d = 0; d < MAX_HORIZON; d++) {
      cum += forecast(d);
      if (cum > stock) return d;
    }
    return MAX_HORIZON;
  };

  const sellable = inv.fba_available + inv.fba_inbound + inv.in_transit + inv.overseas_wh;
  const pipeline = sellable + inv.domestic_wh + inv.in_production;
  const sellableDays = coverDays(sellable);
  const pipelineDays = coverDays(pipeline);

  const leadTime = sku.production_days + sku.sea_days + sku.receiving_days;
  const seaLead = sku.sea_days + sku.receiving_days;
  const airLead = sku.air_days + sku.receiving_days;
  const { safetyDays, coverDays: cover } = settings;
  const targetQty = Math.round(demand(0, leadTime + safetyDays + cover));

  const reasons: string[] = [];
  let status: StockStatus = "healthy";
  let orderRawQty = 0;
  let shipFromDomesticQty = 0;
  let airQty = 0;
  let unavoidableStockoutDays = 0;
  let excessQty = 0;

  if (baseDaily < 0.05) {
    if (pipeline > 0) {
      status = "excess";
      excessQty = pipeline;
      reasons.push("近 30 天几乎没有销量，现有库存均视为冗余");
    }
  } else {
    const pd = pipelineDays ?? MAX_HORIZON;
    const sd = sellableDays ?? MAX_HORIZON;

    if (pd < leadTime + safetyDays) {
      orderRawQty = Math.max(0, targetQty - pipeline);
      reasons.push(
        pd < leadTime
          ? `全部库存只够卖 ${pd} 天，短于下单到上架的 ${leadTime} 天`
          : `全部库存可卖 ${pd} 天，低于"全程 ${leadTime} 天 + 安全 ${safetyDays} 天"`,
      );
    }

    if (sd < seaLead + safetyDays && inv.domestic_wh > 0) {
      const need = Math.round(demand(0, seaLead + safetyDays + cover)) - sellable;
      shipFromDomesticQty = Math.min(inv.domestic_wh, Math.max(0, need));
      if (shipFromDomesticQty > 0) {
        reasons.push(`可售库存只够 ${sd} 天，国内仓有 ${inv.domestic_wh} 件可以尽快发往海外`);
      }
    }

    if (sd < seaLead) {
      if (sd < airLead) unavoidableStockoutDays = airLead - sd;
      airQty = roundToPack(demand(Math.max(sd, airLead), seaLead), sku.case_pack, 0);
      reasons.push(
        `可售库存只够 ${sd} 天，海运补货需要 ${seaLead} 天才能上架` +
          (unavoidableStockoutDays > 0 ? `，即使空运也可能断货约 ${unavoidableStockoutDays} 天` : ""),
      );
    }

    if (pd < leadTime || sd < seaLead) status = "stockout_risk";
    else if (pd < leadTime + safetyDays) status = "reorder";
    else {
      const agedShare = pipeline > 0 ? inv.aged_qty / pipeline : 0;
      const tooMuch = pd > leadTime + safetyDays + cover + settings.excessBufferDays;
      if (tooMuch || (inv.aged_qty > 0 && agedShare >= settings.agedShareThreshold)) {
        status = "excess";
        excessQty = Math.max(
          0,
          pipeline - Math.round(demand(0, leadTime + safetyDays + cover + settings.excessBufferDays)),
          inv.aged_qty,
        );
        if (tooMuch) reasons.push(`全部库存可卖 ${pd >= MAX_HORIZON ? "一年以上" : `${pd} 天`}，明显超出补货周期需要`);
        if (agedShare >= settings.agedShareThreshold && inv.aged_qty > 0)
          reasons.push(`超龄库存 ${inv.aged_qty} 件，占比 ${Math.round(agedShare * 100)}%`);
      }
    }
  }

  const orderQty = roundToPack(orderRawQty, sku.case_pack, sku.moq);
  let orderDate: string | null = null;
  let daysUntilReorder: number | null = null;
  if (orderQty > 0) {
    orderDate = today;
    daysUntilReorder = 0;
  } else if (pipelineDays != null && status !== "excess") {
    daysUntilReorder = Math.max(0, pipelineDays - leadTime - safetyDays);
    orderDate = addDays(today, daysUntilReorder);
  }

  const horizonEnd = addDays(today, leadTime + safetyDays + cover);
  const upcomingPromos = promos
    .filter(
      (p) =>
        (!p.marketplace || p.marketplace === sku.marketplace) &&
        p.end_date >= today &&
        p.start_date <= horizonEnd &&
        Number(p.factor) > 1,
    )
    .map((p) => ({ name: p.name, start_date: p.start_date, end_date: p.end_date, factor: Number(p.factor) }));

  const plan: ReplenishmentPlan = {
    status,
    avg7: avg7 == null ? null : round1(avg7),
    avg14: avg14 == null ? null : round1(avg14),
    avg30: avg30 == null ? null : round1(avg30),
    stockoutDays30,
    promoAdjustedDays30,
    baseDaily: round1(baseDaily),
    forecastDaily30: round1(demand(0, 30) / 30),
    sellable,
    pipeline,
    sellableDays,
    pipelineDays,
    leadTime,
    seaLead,
    airLead,
    safetyDays,
    coverDays: cover,
    targetQty,
    orderQty,
    orderRawQty: Math.round(orderRawQty),
    orderDate,
    daysUntilReorder,
    shipFromDomesticQty,
    airQty,
    unavoidableStockoutDays,
    excessQty,
    excessValue: Math.round(excessQty * Number(sku.unit_cost)),
    upcomingPromos,
    reasons,
    explanation: "",
  };
  plan.explanation = explainPlan(sku, inv, plan);
  return plan;
}

function daysText(days: number | null) {
  if (days == null) return "无法估算（无销量）";
  if (days >= MAX_HORIZON) return "一年以上";
  return `${days} 天`;
}

export function explainPlan(sku: SkuInput, inv: InventoryInput, p: ReplenishmentPlan): string {
  const parts: string[] = [];
  const excluded = p.stockoutDays30 > 0 ? `（已剔除 ${p.stockoutDays30} 天断货日）` : "";
  const promoAdj = p.promoAdjustedDays30 > 0 ? `，并还原了 ${p.promoAdjustedDays30} 天大促的拉动` : "";
  parts.push(`近 30 天日均 ${p.avg30 ?? 0} 件${excluded}${promoAdj}，加权预测日均 ${p.baseDaily} 件。`);
  if (p.upcomingPromos.length > 0) {
    parts.push(
      `补货周期内有${p.upcomingPromos.map((x) => `「${x.name}」(×${x.factor})`).join("、")}，已计入预测。`,
    );
  }
  parts.push(
    `可售库存（FBA 可售 + 入库中 + 在途 + 海外仓）${p.sellable} 件，约可卖 ${daysText(p.sellableDays)}；` +
      `加上国内仓 ${inv.domestic_wh} 件和在产 ${inv.in_production} 件，共 ${p.pipeline} 件，约可卖 ${daysText(p.pipelineDays)}。`,
  );
  parts.push(
    `下单到上架全程约 ${p.leadTime} 天（生产 ${sku.production_days} + 海运 ${sku.sea_days} + 上架 ${sku.receiving_days}），安全库存 ${p.safetyDays} 天。`,
  );

  const actions: string[] = [];
  if (p.orderQty > 0) actions.push(`建议今天下单 ${p.orderQty} 件（覆盖到货后约 ${p.coverDays} 天销量，已按箱规/起订量取整）`);
  if (p.shipFromDomesticQty > 0) actions.push(`国内仓尽快发货 ${p.shipFromDomesticQty} 件`);
  if (p.airQty > 0) actions.push(`考虑空运约 ${p.airQty} 件衔接海运到货前的缺口`);
  if (p.unavoidableStockoutDays > 0) actions.push(`即使空运，仍可能断货约 ${p.unavoidableStockoutDays} 天，建议同步控制广告预算`);

  if (p.status === "excess") {
    parts.push(
      `结论：库存偏多，约 ${p.excessQty} 件属于冗余（约 ¥${p.excessValue.toLocaleString()}），建议暂停补货，考虑促销清货或调拨到其他站点。`,
    );
  } else if (actions.length > 0) {
    parts.push(`结论：${actions.join("；")}。`);
  } else if (p.daysUntilReorder != null) {
    parts.push(`结论：库存健康，预计 ${p.daysUntilReorder} 天后（${p.orderDate}）需要下一次下单。`);
  } else {
    parts.push("结论：暂无销量和库存，无需处理。");
  }
  return parts.join("");
}
