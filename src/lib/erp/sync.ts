import "server-only";
import { sql, tx, type Query } from "../db";
import { addDays, todayStr } from "../dates";
import { clearBusinessData } from "../seed";
import { describeErpConfig, ErpClient, ErpError, readErpConfig } from "./client";
import { mapSnapshot, type ErpSnapshot, type MappedData, type SyncWarning } from "./mapping";

export const SALES_DAYS = 60;
const PURCHASE_ORDER_DAYS = 365;

export type SyncSummary = {
  firstSync: boolean;
  skus: number;
  inventory: number;
  salesRows: number;
  shipments: number;
  orders: number;
  deactivated: number;
  source: Record<string, number>;
  fetchStats: Record<string, { fetched: number; total: number | null; pages: number }>;
  breakdown: Record<string, [string, number][]>;
  fields: Record<string, string[]>;
  stores: MappedData["storeMarketplaces"];
  requests: number;
  durationMs: number;
};

export type SyncRun = {
  id: number;
  status: "running" | "success" | "failed";
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
  summary: Partial<SyncSummary>;
  warnings: SyncWarning[];
  error: string | null;
};

type Row = Record<string, unknown>;

const rowsOf = (json: unknown): { rows: Row[]; total?: number } => {
  const j = (json ?? {}) as { data?: unknown; total?: number };
  if (Array.isArray(j.data)) return { rows: j.data as Row[], total: j.total };
  const d = (j.data ?? {}) as { list?: Row[]; total?: number };
  return { rows: d.list ?? [], total: d.total };
};

async function fetchSnapshot(client: ErpClient, today: string): Promise<ErpSnapshot> {
  const products = await client.listAll<Row>("api/v1/products");
  const warehouses = await client.listAll<Row>("api/v1/warehouses");
  const fbaStock = await client.paginate<Row>("basicOpen/openapi/storage/fbaWarehouseDetail", {}, { pageSize: 200, pick: rowsOf });
  const localStock = await client.paginate<Row>("erp/sc/routing/data/local_inventory/inventoryDetails", {}, { pageSize: 800, pick: rowsOf });
  const purchaseOrders = await client.paginate<Row>(
    "erp/sc/routing/data/local_inventory/purchaseOrderList",
    { search_field_time: "create_time", start_date: addDays(today, -PURCHASE_ORDER_DAYS), end_date: today },
    { pageSize: 500, pick: rowsOf },
  );
  const shipments = await client.listAll<Row>("api/v1/shipments");
  const deliveryOrders = await client.listAll<Row>("api/v1/fba-delivery-orders");
  const orders = await client.paginate<Row>(
    "erp/sc/data/mws/orders",
    { date_type: 1, start_date: addDays(today, -SALES_DAYS), end_date: addDays(today, 1) },
    { pageSize: 1000, pick: rowsOf },
  );
  return { products, warehouses, fbaStock, localStock, purchaseOrders, shipments, deliveryOrders, orders };
}

function countBy(rows: Row[], key: (r: Row) => string, limit = 12): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function describeSnapshot(snap: ErpSnapshot): Record<string, [string, number][]> {
  const text = (v: unknown) => String(v ?? "").trim() || "（空）";
  const label = (sid: unknown, name: unknown) => `${String(name ?? "").trim() || "（无名称）"}｜sid ${String(sid ?? "")}`;
  return {
    订单按销售渠道: countBy(snap.orders, (o) => String(o.sales_channel ?? "").trim() || "（空）"),
    订单按店铺: countBy(snap.orders, (o) => label(o.sid, o.seller_name)),
    订单按状态: countBy(snap.orders, (o) => String(o.order_status ?? "").trim() || "（空）"),
    FBA库存按店铺: countBy(snap.fbaStock, (f) => `${label(f.sid, f.seller_group_name || f.name)}｜共享类型 ${String(f.share_type ?? "")}`),
    仓库类型: countBy(snap.warehouses, (w) => `${String(w.warehouse_type ?? "").trim() || "（空）"}｜${String(w.country ?? "").trim() || "（无国家）"}`),
    采购单按状态: countBy(snap.purchaseOrders, (po) => `${String(po.status ?? "（空）")} ${String(po.status_text ?? "").trim()}`.trim()),
    货件按状态: countBy(snap.shipments, (s) => `${text(s.status_text)}｜亚马逊状态 ${text(s.amazon_status)}`),
    货件按国家: countBy(snap.shipments, (s) => `${text(s.country)}｜站点 ${text(s.site)}｜目的地 ${text(s.destination)}`),
    FBA发货单按状态: countBy(snap.deliveryOrders, (d) => `${text(d.status_text)}｜${String(d.shipped_at ?? "").trim() ? "有发货时间" : "无发货时间"}`),
    FBA发货单按店铺: countBy(snap.deliveryOrders, (d) => text(d.store_name)),
    仓库库存明细按仓库: countBy(snap.localStock, (r) => {
      const wid = String(r.wid ?? "").trim();
      const wh = snap.warehouses.find((w) => String(w.id) === wid);
      return wid ? `wid ${wid}｜${wh ? `${String(wh.name ?? "")}（${String(wh.warehouse_type ?? "")}）` : "仓库列表中没有"}` : "（没有 wid 字段）";
    }),
  };
}

function firstKeys(rows: Row[] | undefined) {
  const r = rows?.[0];
  return r && typeof r === "object" ? Object.keys(r) : [];
}

/** Field names (not values) of the first row of each source, to compare against the OpenAPI contract. */
function describeFields(snap: ErpSnapshot): Record<string, string[]> {
  return {
    产品列表: firstKeys(snap.products),
    仓库列表: firstKeys(snap.warehouses),
    FBA库存: firstKeys(snap.fbaStock),
    仓库库存明细: firstKeys(snap.localStock),
    采购单: firstKeys(snap.purchaseOrders),
    "采购单.item_list": firstKeys(snap.purchaseOrders[0]?.item_list as Row[] | undefined),
    货件: firstKeys(snap.shipments),
    FBA发货单: firstKeys(snap.deliveryOrders),
    "FBA发货单.item_list": firstKeys(snap.deliveryOrders.find((d) => Array.isArray(d.item_list) && d.item_list.length)?.item_list as Row[] | undefined),
    订单: firstKeys(snap.orders),
    "订单.item_list": firstKeys(snap.orders[0]?.item_list as Row[] | undefined),
  };
}

async function writeData(q: Query, data: MappedData, today: string) {
  const meta = await q<{ value: string }>("select value from app_meta where key = 'data_source'");
  const firstSync = meta[0]?.value !== "erp";
  if (firstSync) await clearBusinessData(q);

  for (const s of data.skus) {
    await q(
      `insert into skus (sku, marketplace, asin, name, category, owner, unit_cost, case_pack, moq,
         production_days, sea_days, air_days, receiving_days)
       values ($1, $2::text, $3, $4, $5, $6, coalesce($7::numeric, 0), coalesce($8::int, 1), coalesce($9::int, 0),
         coalesce($10::int, 20), case when $2::text = 'US' then 30 else 40 end, 10, 10)
       on conflict (sku, marketplace) do update set
         asin = coalesce($3, skus.asin), name = $4, category = coalesce($5, skus.category),
         owner = coalesce($6, skus.owner), unit_cost = coalesce($7::numeric, skus.unit_cost),
         case_pack = coalesce($8::int, skus.case_pack), moq = coalesce($9::int, skus.moq),
         production_days = coalesce($10::int, skus.production_days), active = true, updated_at = now()`,
      [s.sku, s.marketplace, s.asin, s.name, s.category, s.owner, s.unit_cost, s.case_pack, s.moq, s.production_days],
    );
  }
  const keys = data.skus.map((s) => `${s.sku}|${s.marketplace}`);
  const deactivated = await q(
    "update skus set active = false, updated_at = now() where active and not ((sku || '|' || marketplace) = any($1::text[])) returning id",
    [keys],
  );
  const idRows = await q<{ id: number; key: string }>(
    "select id, sku || '|' || marketplace as key from skus where (sku || '|' || marketplace) = any($1::text[])",
    [keys],
  );
  const ids = new Map(idRows.map((r) => [r.key, r.id]));
  const syncedIds = [...ids.values()];

  await q("delete from inventory");
  const invRows = keys.map((k) => ({ id: ids.get(k)!, v: data.inventory.get(k) }));
  await q(
    `insert into inventory (sku_id, fba_available, fba_inbound, in_transit, overseas_wh, domestic_wh, in_production, aged_qty, snapshot_date)
     select u.*, $9::date from unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::int[]) as u`,
    [
      invRows.map((r) => r.id),
      invRows.map((r) => r.v?.fba_available ?? 0),
      invRows.map((r) => r.v?.fba_inbound ?? 0),
      invRows.map((r) => r.v?.in_transit ?? 0),
      invRows.map((r) => r.v?.overseas_wh ?? 0),
      invRows.map((r) => r.v?.domestic_wh ?? 0),
      invRows.map((r) => r.v?.in_production ?? 0),
      invRows.map((r) => r.v?.aged_qty ?? 0),
      today,
    ],
  );

  await q("delete from shipments");
  await q(
    `insert into shipments (shipment_no, sku_id, qty, method, status, ship_date, eta)
     select * from unnest($1::text[], $2::int[], $3::int[], $4::text[], $5::text[], $6::date[], $7::date[])`,
    [
      data.shipments.map((s) => s.shipment_no),
      data.shipments.map((s) => ids.get(`${s.sku}|${s.marketplace}`)!),
      data.shipments.map((s) => s.qty),
      data.shipments.map((s) => s.method),
      data.shipments.map((s) => s.status),
      data.shipments.map((s) => s.ship_date),
      data.shipments.map((s) => s.eta),
    ],
  );

  await q("delete from daily_sales where sku_id = any($1::int[]) and date >= $2 and date < $3", [
    syncedIds,
    addDays(today, -SALES_DAYS),
    today,
  ]);
  await q(
    `insert into daily_sales (sku_id, date, units, in_stock)
     select u.*, true from unnest($1::int[], $2::date[], $3::int[]) as u`,
    [
      data.sales.map((s) => ids.get(`${s.sku}|${s.marketplace}`)!),
      data.sales.map((s) => s.date),
      data.sales.map((s) => s.units),
    ],
  );

  await q(
    `insert into orders (order_id, marketplace, sku, purchase_date, tracking_no, shipping_status, est_delivery, updated_at)
     select u.*, now() from unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::text[], $6::text[], $7::date[]) as u
     on conflict (order_id) do update set marketplace = coalesce(excluded.marketplace, orders.marketplace),
       sku = coalesce(excluded.sku, orders.sku), purchase_date = coalesce(excluded.purchase_date, orders.purchase_date),
       tracking_no = coalesce(excluded.tracking_no, orders.tracking_no),
       shipping_status = coalesce(excluded.shipping_status, orders.shipping_status),
       est_delivery = coalesce(excluded.est_delivery, orders.est_delivery), updated_at = now()`,
    [
      data.orders.map((o) => o.order_id),
      data.orders.map((o) => o.marketplace),
      data.orders.map((o) => o.sku),
      data.orders.map((o) => o.purchase_date),
      data.orders.map((o) => o.tracking_no),
      data.orders.map((o) => o.shipping_status),
      data.orders.map((o) => o.est_delivery),
    ],
  );

  await q(
    `insert into app_meta (key, value) values ('data_source', 'erp')
     on conflict (key) do update set value = excluded.value`,
  );
  return { firstSync, deactivated: deactivated.length };
}

export async function runErpSync(triggeredBy: string): Promise<SyncRun> {
  const config = readErpConfig();
  if (!config) throw new ErpError("尚未配置 ERP 连接（ERP_BASE_URL、ERP_USERNAME、ERP_PASSWORD）");

  const claimed = await sql<{ id: number }>(
    `insert into erp_sync_runs (status, triggered_by)
     select 'running', $1
     where not exists (select 1 from erp_sync_runs where status = 'running' and started_at > now() - interval '15 minutes')
     returning id`,
    [triggeredBy],
  );
  if (!claimed[0]) throw new ErpError("已有一个同步任务正在进行，请稍后刷新查看结果", 409);
  const runId = claimed[0].id;
  const started = Date.now();
  const today = todayStr();
  const client = new ErpClient(config);
  console.info(`[erp-sync] run=${runId} 开始 by=${triggeredBy} host=${config.baseUrl.host}`);

  try {
    const snap = await fetchSnapshot(client, today);
    const source = Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, (v as unknown[]).length]));
    const breakdown = describeSnapshot(snap);
    const fields = describeFields(snap);
    console.info(`[erp-sync] run=${runId} 字段 ${JSON.stringify(fields)}`);
    console.info(`[erp-sync] run=${runId} 拉取完成 ${JSON.stringify(source)} stats=${JSON.stringify(client.fetchStats)}`);
    console.info(`[erp-sync] run=${runId} 原始数据分布 ${JSON.stringify(breakdown)}`);
    const data = mapSnapshot(snap, today, SALES_DAYS);
    console.info(
      `[erp-sync] run=${runId} 映射完成 skus=${data.skus.length} sales=${data.sales.length} shipments=${data.shipments.length} orders=${data.orders.length} warnings=${data.warnings.map((w) => w.code).join(",")}`,
    );
    const written = await tx((q) => writeData(q, data, today));
    const summary: SyncSummary = {
      firstSync: written.firstSync,
      skus: data.skus.length,
      inventory: data.skus.length,
      salesRows: data.sales.length,
      shipments: data.shipments.length,
      orders: data.orders.length,
      deactivated: written.deactivated,
      source,
      fetchStats: client.fetchStats,
      breakdown,
      fields,
      stores: data.storeMarketplaces,
      requests: client.requestCount,
      durationMs: Date.now() - started,
    };
    const [run] = await sql<SyncRun>(
      `update erp_sync_runs set status = 'success', finished_at = now(), summary = $2::jsonb, warnings = $3::jsonb
       where id = $1 returning *`,
      [runId, JSON.stringify(summary), JSON.stringify(data.warnings)],
    );
    console.info(`[erp-sync] run=${runId} 成功 ${summary.durationMs}ms`);
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[erp-sync] run=${runId} 失败：${message}`);
    await sql("update erp_sync_runs set status = 'failed', finished_at = now(), error = $2 where id = $1", [runId, message]);
    throw error instanceof ErpError ? error : new ErpError(`同步失败：${message}`);
  }
}

export async function getSyncOverview() {
  const runs = await sql<SyncRun>(
    `select id, status, triggered_by, started_at::text, finished_at::text, summary, warnings, error
     from erp_sync_runs order by started_at desc limit 5`,
  );
  const meta = await sql<{ value: string }>("select value from app_meta where key = 'data_source'");
  return { config: describeErpConfig(), runs, dataSource: meta[0]?.value === "erp" ? ("erp" as const) : ("local" as const) };
}
