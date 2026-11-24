import "server-only";
import { sql } from "./db";
import { addDays, todayStr } from "./dates";
import {
  computePlan,
  promoFactor,
  type InventoryInput,
  type Promotion,
  type ReplenishmentPlan,
  type SalesPoint,
  type SkuInput,
} from "./replenishment";
import { getReplenishmentSettings } from "./settings";
import type { StockStatus } from "./constants";

export type SkuRow = SkuInput & {
  asin: string | null;
  category: string | null;
  owner: string | null;
};

export type PlanRow = SkuRow &
  InventoryInput & {
    snapshot_date: string | null;
    plan: ReplenishmentPlan;
  };

const STATUS_ORDER: Record<StockStatus, number> = { stockout_risk: 0, reorder: 1, excess: 2, healthy: 3 };

export async function getPromotions(): Promise<Required<Promotion>[]> {
  return sql<Required<Promotion>>(
    `select id, name, marketplace, to_char(start_date, 'YYYY-MM-DD') as start_date,
            to_char(end_date, 'YYYY-MM-DD') as end_date, factor::float8 as factor
     from promotions order by start_date`,
  );
}

const SKU_COLUMNS = `s.id, s.sku, s.marketplace, s.asin, s.name, s.category, s.owner, s.unit_cost::float8 as unit_cost,
  s.case_pack, s.moq, s.production_days, s.sea_days, s.air_days, s.receiving_days,
  coalesce(i.fba_available, 0) as fba_available, coalesce(i.fba_inbound, 0) as fba_inbound,
  coalesce(i.in_transit, 0) as in_transit, coalesce(i.overseas_wh, 0) as overseas_wh,
  coalesce(i.domestic_wh, 0) as domestic_wh, coalesce(i.in_production, 0) as in_production,
  coalesce(i.aged_qty, 0) as aged_qty, to_char(i.snapshot_date, 'YYYY-MM-DD') as snapshot_date`;

type RawRow = Omit<PlanRow, "plan">;

export async function loadPlans(): Promise<PlanRow[]> {
  const today = todayStr();
  const [rows, sales, promos, settings] = await Promise.all([
    sql<RawRow>(`select ${SKU_COLUMNS} from skus s left join inventory i on i.sku_id = s.id where s.active`),
    sql<SalesPoint & { sku_id: number }>(
      `select sku_id, to_char(date, 'YYYY-MM-DD') as date, units, in_stock from daily_sales
       where date >= $1 and date < $2`,
      [addDays(today, -30), today],
    ),
    getPromotions(),
    getReplenishmentSettings(),
  ]);
  const salesBySku = new Map<number, SalesPoint[]>();
  for (const s of sales) {
    const list = salesBySku.get(s.sku_id) ?? [];
    list.push(s);
    salesBySku.set(s.sku_id, list);
  }
  return rows
    .map((r) => ({ ...r, plan: computePlan(r, r, salesBySku.get(r.id) ?? [], promos, settings, today) }))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.plan.status] - STATUS_ORDER[b.plan.status] ||
        (a.plan.sellableDays ?? 9999) - (b.plan.sellableDays ?? 9999),
    );
}

export type ShipmentRow = {
  id: number;
  shipment_no: string;
  sku_id: number;
  sku: string;
  marketplace: string;
  name: string;
  qty: number;
  method: string;
  status: string;
  ship_date: string | null;
  eta: string | null;
};

export async function getShipments(opts: { skuId?: number; withinDays?: number } = {}): Promise<ShipmentRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.skuId) {
    params.push(opts.skuId);
    where.push(`sh.sku_id = $${params.length}`);
  }
  if (opts.withinDays != null) {
    params.push(addDays(todayStr(), opts.withinDays));
    where.push(`sh.eta <= $${params.length} and sh.status not like '%入库%'`);
  }
  return sql<ShipmentRow>(
    `select sh.id, sh.shipment_no, sh.sku_id, s.sku, s.marketplace, s.name, sh.qty, sh.method, sh.status,
            to_char(sh.ship_date, 'YYYY-MM-DD') as ship_date, to_char(sh.eta, 'YYYY-MM-DD') as eta
     from shipments sh join skus s on s.id = sh.sku_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by sh.eta nulls last, sh.id`,
    params,
  );
}

export type DecisionRow = {
  id: number;
  suggested_qty: number;
  final_qty: number;
  reason: string | null;
  decided_by: string | null;
  created_at: string;
};

export type SkuDetail = {
  row: PlanRow;
  chart: { date: string; actual: number | null; forecast: number | null; outOfStock: boolean }[];
  shipments: ShipmentRow[];
  decisions: DecisionRow[];
  promos: Promotion[];
};

export async function getSkuDetail(id: number): Promise<SkuDetail | null> {
  const today = todayStr();
  const rows = await sql<RawRow>(
    `select ${SKU_COLUMNS} from skus s left join inventory i on i.sku_id = s.id where s.id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const [sales, promos, settings, shipments, decisions] = await Promise.all([
    sql<SalesPoint>(
      `select to_char(date, 'YYYY-MM-DD') as date, units, in_stock from daily_sales
       where sku_id = $1 and date >= $2 and date < $3 order by date`,
      [id, addDays(today, -60), today],
    ),
    getPromotions(),
    getReplenishmentSettings(),
    getShipments({ skuId: id }),
    sql<DecisionRow>(
      `select id, suggested_qty, final_qty, reason, decided_by, created_at::text as created_at
       from replenishment_decisions where sku_id = $1 order by created_at desc limit 20`,
      [id],
    ),
  ]);
  const row = rows[0];
  const plan = computePlan(row, row, sales.filter((s) => s.date >= addDays(today, -30)), promos, settings, today);

  const byDate = new Map(sales.map((s) => [s.date, s]));
  const chart: SkuDetail["chart"] = [];
  for (let i = 60; i >= 1; i--) {
    const date = addDays(today, -i);
    const s = byDate.get(date);
    chart.push({ date, actual: s ? s.units : 0, forecast: null, outOfStock: s ? !s.in_stock : false });
  }
  for (let d = 0; d < 45; d++) {
    const date = addDays(today, d);
    chart.push({
      date,
      actual: null,
      forecast: Math.round(plan.baseDaily * promoFactor(date, row.marketplace, promos) * 10) / 10,
      outOfStock: false,
    });
  }
  return { row: { ...row, plan }, chart, shipments, decisions, promos };
}

export async function findSkus(term: string, marketplace?: string | null) {
  const like = `%${term.trim().toLowerCase()}%`;
  const params: unknown[] = [like];
  let extra = "";
  if (marketplace) {
    params.push(marketplace);
    extra = ` and s.marketplace = $2`;
  }
  return sql<{ id: number }>(
    `select s.id from skus s where (lower(s.sku) like $1 or lower(s.name) like $1 or lower(coalesce(s.asin, '')) like $1)${extra}`,
    params,
  );
}
