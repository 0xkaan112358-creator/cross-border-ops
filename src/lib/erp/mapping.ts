import { normalizeMarketplace, type Marketplace } from "../constants";
import { addDays } from "../dates";

type Row = Record<string, unknown>;

export type ErpSnapshot = {
  products: Row[];
  warehouses: Row[];
  fbaStock: Row[];
  localStock: Row[];
  purchaseOrders: Row[];
  shipments: Row[];
  orders: Row[];
};

export type SyncedSku = {
  sku: string;
  marketplace: Marketplace;
  asin: string | null;
  name: string;
  category: string | null;
  owner: string | null;
  unit_cost: number | null;
  case_pack: number | null;
  moq: number | null;
  production_days: number | null;
};

export type SyncedInventory = {
  fba_available: number;
  fba_inbound: number;
  in_transit: number;
  overseas_wh: number;
  domestic_wh: number;
  in_production: number;
  aged_qty: number;
};

export type SyncedShipment = {
  shipment_no: string;
  sku: string;
  marketplace: Marketplace;
  qty: number;
  method: string;
  status: string;
  ship_date: string | null;
  eta: string | null;
};

export type SyncedOrder = {
  order_id: string;
  marketplace: Marketplace | null;
  sku: string | null;
  purchase_date: string | null;
  tracking_no: string | null;
  shipping_status: string | null;
  est_delivery: string | null;
};

export type SyncWarning = { code: string; message: string; samples: string[] };

export type MappedData = {
  skus: SyncedSku[];
  inventory: Map<string, SyncedInventory>;
  sales: { sku: string; marketplace: Marketplace; date: string; units: number }[];
  shipments: SyncedShipment[];
  orders: SyncedOrder[];
  storeMarketplaces: { sid: string; name: string; marketplace: Marketplace | null; source: string }[];
  warnings: SyncWarning[];
};

const str = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const optNum = (v: unknown) => (v == null || str(v) === "" ? null : num(v));
const dateOf = (v: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
  return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

const COUNTRY_PATTERNS: [RegExp, Marketplace][] = [
  [/amazon\.com(?!\.)|united states|\busa?\b|美国/i, "US"],
  [/amazon\.co\.uk|united kingdom|\buk\b|\bgb\b|英国/i, "UK"],
  [/amazon\.de|germany|deutschland|\bde\b|德国/i, "DE"],
  [/amazon\.fr|france|\bfr\b|法国/i, "FR"],
  [/amazon\.it|italy|italia|\bit\b|意大利/i, "IT"],
  [/amazon\.es|spain|españa|\bes\b|西班牙/i, "ES"],
];

/** Finds a supported marketplace in free text such as "Amazon.de", "德国", "Shop-DE" or "XX美国仓". */
export function guessMarketplace(text: unknown): Marketplace | null {
  const s = str(text);
  if (!s) return null;
  const exact = normalizeMarketplace(s);
  if (exact) return exact;
  const spaced = s.replace(/[-_/|·()（）[\]]/g, " ");
  const hits = new Set<Marketplace>();
  for (const [re, mp] of COUNTRY_PATTERNS) if (re.test(spaced)) hits.add(mp);
  return hits.size === 1 ? [...hits][0] : null;
}

class Warnings {
  private map = new Map<string, SyncWarning>();
  add(code: string, message: string, sample?: string) {
    const w = this.map.get(code) ?? { code, message, samples: [] };
    if (sample && w.samples.length < 8 && !w.samples.includes(sample)) w.samples.push(sample);
    this.map.set(code, w);
  }
  list() {
    return [...this.map.values()];
  }
}

const SHIPPED_ORDER_STATUS: Record<string, string> = {
  shipped: "已发货",
  partiallyshipped: "部分发货",
  unshipped: "待发货",
  pending: "待发货",
  pendingavailability: "待发货",
  canceled: "已取消",
  cancelled: "已取消",
};

const SHARED_POOLS: Record<number, Marketplace[]> = {
  1: ["US"],
  2: ["DE", "FR", "IT", "ES"],
};

/** Splits an integer total by weights, giving leftover units to the largest remainders. */
function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i]++;
    rest--;
  }
  return out;
}

function shipMethod(text: string) {
  if (/空运|air/i.test(text)) return "air";
  if (/铁路|卡航|rail|train/i.test(text)) return "rail";
  if (/快递|express|dhl|ups|fedex/i.test(text)) return "express";
  return "sea";
}

export function mapSnapshot(snap: ErpSnapshot, today: string, salesDays: number): MappedData {
  const warnings = new Warnings();

  // Store id -> marketplace, collected from every source that carries a country hint.
  const stores = new Map<string, { name: string; votes: Map<Marketplace, number>; source: string }>();
  const hint = (sid: unknown, name: unknown, text: unknown, source: string) => {
    const id = str(sid);
    if (!id || id === "0") return;
    const entry = stores.get(id) ?? { name: str(name), votes: new Map(), source };
    if (!entry.name && str(name)) entry.name = str(name);
    const mp = guessMarketplace(text);
    if (mp) entry.votes.set(mp, (entry.votes.get(mp) ?? 0) + 1);
    stores.set(id, entry);
  };
  for (const o of snap.orders) hint(o.sid, o.seller_name, o.sales_channel, "订单销售渠道");
  for (const s of snap.shipments) {
    for (const r of (s.relate_list as Row[] | undefined) ?? []) hint(r.sid, r.sname, r.nation, "发货单国家");
  }
  for (const f of snap.fbaStock) hint(f.sid, f.seller_group_name || f.name, "", "FBA库存");
  for (const [, e] of stores) {
    if (e.votes.size === 0) {
      const mp = guessMarketplace(e.name);
      if (mp) e.votes.set(mp, 1);
    }
  }
  const storeMarketplace = new Map<string, Marketplace | null>();
  const storeMarketplaces: MappedData["storeMarketplaces"] = [];
  for (const [sid, e] of stores) {
    const ranked = [...e.votes.entries()].sort((a, b) => b[1] - a[1]);
    const mp = ranked[0]?.[0] ?? null;
    storeMarketplace.set(sid, mp);
    storeMarketplaces.push({ sid, name: e.name, marketplace: mp, source: ranked.length ? e.source : "无法识别" });
    if (!mp) warnings.add("store_unknown", "店铺无法识别所属站点（不在美/英/德/法/意/西范围或名称里没有国家信息），相关数据已跳过", `${e.name || "店铺"}（sid ${sid}）`);
  }
  const mpOfStore = (sid: unknown) => storeMarketplace.get(str(sid)) ?? null;

  const products = new Map<string, Row>();
  for (const p of snap.products) if (str(p.sku)) products.set(str(p.sku), p);

  const keyOf = (sku: string, mp: Marketplace) => `${sku}|${mp}`;
  const skuMeta = new Map<string, { sku: string; marketplace: Marketplace; asin: string | null; name: string | null }>();
  const touch = (sku: string, mp: Marketplace, asin?: unknown, name?: unknown) => {
    const k = keyOf(sku, mp);
    const cur = skuMeta.get(k) ?? { sku, marketplace: mp, asin: null, name: null };
    if (!cur.asin && str(asin)) cur.asin = str(asin);
    if (!cur.name && str(name)) cur.name = str(name);
    skuMeta.set(k, cur);
    return k;
  };
  const inventory = new Map<string, SyncedInventory>();
  const inv = (k: string) => {
    let v = inventory.get(k);
    if (!v) {
      v = { fba_available: 0, fba_inbound: 0, in_transit: 0, overseas_wh: 0, domestic_wh: 0, in_production: 0, aged_qty: 0 };
      inventory.set(k, v);
    }
    return v;
  };
  const localSku = (row: Row, ...fallbacks: string[]) => {
    const s = str(row.sku) || str(row.local_sku);
    if (s) return s;
    for (const f of fallbacks) if (str(row[f])) {
      warnings.add("sku_fallback_msku", "部分记录没有本地 SKU，已改用 MSKU 匹配", str(row[f]));
      return str(row[f]);
    }
    return "";
  };

  // Sales and orders.
  const salesStart = addDays(today, -salesDays);
  const salesAgg = new Map<string, number>();
  const orders: SyncedOrder[] = [];
  for (const o of snap.orders) {
    const status = str(o.order_status);
    const mp = guessMarketplace(o.sales_channel) ?? mpOfStore(o.sid);
    const date = dateOf(o.purchase_date_local) ?? dateOf(o.purchase_date);
    const items = (o.item_list as Row[] | undefined) ?? [];
    const firstSku = items.length ? localSku(items[0], "seller_sku") : "";
    const mapped = SHIPPED_ORDER_STATUS[status.toLowerCase().replace(/[^a-z]/g, "")] ?? (status || null);
    if (str(o.amazon_order_id)) {
      orders.push({
        order_id: str(o.amazon_order_id),
        marketplace: mp,
        sku: firstSku || null,
        purchase_date: date,
        tracking_no: str(o.tracking_number) || null,
        shipping_status: mapped,
        est_delivery: dateOf(o.estimated_arrival_date),
      });
    }
    if (/cancel/i.test(status) || !date || date < salesStart || date >= today) continue;
    if (!mp) {
      warnings.add("order_no_marketplace", "订单无法识别站点，未计入销量", str(o.amazon_order_id));
      continue;
    }
    for (const it of items) {
      const sku = localSku(it, "seller_sku");
      const qty = num(it.quantity_ordered);
      if (!sku || qty <= 0) continue;
      touch(sku, mp, it.asin, it.local_name);
      const k = `${sku}|${mp}|${date}`;
      salesAgg.set(k, (salesAgg.get(k) ?? 0) + qty);
    }
  }
  const sales = [...salesAgg.entries()].map(([k, units]) => {
    const [sku, marketplace, date] = k.split("|");
    return { sku, marketplace: marketplace as Marketplace, date, units };
  });

  const soldBySkuMp = new Map<string, number>();
  for (const s of sales) soldBySkuMp.set(keyOf(s.sku, s.marketplace), (soldBySkuMp.get(keyOf(s.sku, s.marketplace)) ?? 0) + s.units);
  // FBA stock. Shared (pan-EU / NA) rows come back with sid 0 and are split by the per-store list when present.
  for (const f of snap.fbaStock) {
    const sku = localSku(f, "seller_sku");
    if (!sku) continue;
    const fulfillable =
      f.total_fulfillable_quantity != null
        ? num(f.total_fulfillable_quantity)
        : num(f.afn_fulfillable_quantity) + num(f.reserved_fc_transfers) + num(f.reserved_fc_processing);
    const aged =
      num(f.inv_age_181_to_270_days) +
      (f.inv_age_271_to_365_days != null
        ? num(f.inv_age_271_to_365_days)
        : num(f.inv_age_271_to_330_days) + num(f.inv_age_331_to_365_days)) +
      num(f.inv_age_365_plus_days);
    let mp = mpOfStore(f.sid);
    const perStore = (f.fba_storage_quantity_list as Row[] | undefined) ?? [];
    if (!mp && str(f.sid) === "0" && perStore.length) {
      let first: Marketplace | null = null;
      for (const s of perStore) {
        const smp = mpOfStore(s.sid) ?? guessMarketplace(s.name);
        if (!smp) continue;
        first ??= smp;
        inv(touch(sku, smp, f.asin, f.product_name)).fba_available += num(s.quantity_for_local_fulfillment);
      }
      if (first) {
        const v = inv(touch(sku, first, f.asin, f.product_name));
        v.fba_inbound += num(f.afn_inbound_receiving_quantity);
        v.in_transit += num(f.afn_inbound_shipped_quantity);
        v.aged_qty += aged;
        warnings.add("fba_shared", "共享仓库存按各店铺可售数拆分，入库中、在途和超龄库存计入第一个店铺的站点", `${sku}（${f.name ? str(f.name) : "共享仓"}）`);
        continue;
      }
    }
    mp ??= guessMarketplace(f.name);
    if (!mp && str(f.sid) === "0" && SHARED_POOLS[num(f.share_type)]) {
      const pool = SHARED_POOLS[num(f.share_type)];
      const sold = pool.map((m) => soldBySkuMp.get(keyOf(sku, m)) ?? 0);
      const hasSales = sold.some((x) => x > 0);
      const targets = hasSales ? pool.filter((_, i) => sold[i] > 0) : [pool[0]];
      const weights = hasSales ? sold.filter((x) => x > 0) : [1];
      const parts = {
        fba_available: splitByWeight(fulfillable, weights),
        fba_inbound: splitByWeight(num(f.afn_inbound_receiving_quantity), weights),
        in_transit: splitByWeight(num(f.afn_inbound_shipped_quantity), weights),
        aged_qty: splitByWeight(aged, weights),
      };
      targets.forEach((m, i) => {
        const v = inv(touch(sku, m, f.asin, f.product_name));
        v.fba_available += parts.fba_available[i];
        v.fba_inbound += parts.fba_inbound[i];
        v.in_transit += parts.in_transit[i];
        v.aged_qty += parts.aged_qty[i];
      });
      warnings.add(
        "fba_shared_split",
        "共享仓库存没有按店铺拆分的数据，已按各站点近 60 天销量比例分摊（欧洲共享仓分摊到德/法/意/西，没有销量时计入德国站；北美共享仓计入美国站）",
        `${sku}：${targets.map((m, i) => `${m} ${parts.fba_available[i]}`).join(" / ")}`,
      );
      continue;
    }
    if (!mp) {
      warnings.add("fba_no_marketplace", "FBA 库存无法识别站点，已跳过", `${sku}（${str(f.name) || `sid ${str(f.sid)}`}）`);
      continue;
    }
    const v = inv(touch(sku, mp, f.asin, f.product_name));
    v.fba_available += fulfillable;
    v.fba_inbound += num(f.afn_inbound_receiving_quantity);
    v.in_transit += num(f.afn_inbound_shipped_quantity);
    v.aged_qty += aged;
  }

  // In-transit FBA shipments.
  const shipAgg = new Map<string, SyncedShipment>();
  for (const s of snap.shipments) {
    if (num(s.status) !== 1 || num(s.is_delete) === 1) continue;
    const method = shipMethod(`${str(s.method_name)} ${str(s.logistics_channel_name)}`);
    const shipDate = dateOf(s.shipment_time) ?? dateOf(s.shipment_time_second);
    const eta = dateOf(s.expected_arrival_date) ?? dateOf(s.eta_date);
    const delivered = dateOf(s.delivery_date) != null;
    for (const r of (s.relate_list as Row[] | undefined) ?? []) {
      const sku = localSku(r, "msku");
      const mp = guessMarketplace(r.nation) ?? mpOfStore(r.sid);
      const qty = num(r.num) || num(r.quantity_shipped);
      if (!sku || qty <= 0) continue;
      if (!mp) {
        warnings.add("shipment_no_marketplace", "发货单明细无法识别站点，已跳过", `${str(s.shipment_sn)} ${sku}`);
        continue;
      }
      touch(sku, mp, r.asin, r.product_name);
      const shipmentNo = str(r.shipment_id) || str(s.shipment_sn);
      const k = `${shipmentNo}|${sku}|${mp}`;
      const cur = shipAgg.get(k);
      if (cur) cur.qty += qty;
      else
        shipAgg.set(k, {
          shipment_no: shipmentNo,
          sku,
          marketplace: mp,
          qty,
          method,
          status: delivered ? "已到仓·入库中" : "运输中",
          ship_date: shipDate,
          eta,
        });
    }
  }

  // Marketplace a SKU's non-store-specific stock (domestic warehouse, purchase orders) is attributed to:
  // the one with the most units sold in the window, then US, then any.
  const primaryMarketplace = (sku: string): Marketplace | null => {
    const candidates = [...skuMeta.values()].filter((m) => m.sku === sku);
    if (!candidates.length) return null;
    candidates.sort(
      (a, b) =>
        (soldBySkuMp.get(keyOf(b.sku, b.marketplace)) ?? 0) - (soldBySkuMp.get(keyOf(a.sku, a.marketplace)) ?? 0) ||
        Number(b.marketplace === "US") - Number(a.marketplace === "US"),
    );
    return candidates[0].marketplace;
  };

  // Local / overseas warehouse stock.
  const whById = new Map<string, Row>();
  for (const w of snap.warehouses) whById.set(str(w.id), w);
  for (const r of snap.localStock) {
    const sku = localSku(r);
    if (!sku) continue;
    const qty = num(r.product_valid_num) + num(r.product_onway);
    if (qty <= 0) continue;
    const wh = whById.get(str(r.wid));
    const type = str(wh?.warehouse_type);
    const whName = str(wh?.name) || `仓库 ${str(r.wid)}`;
    if (/fba|亚马逊|amazon/i.test(type)) continue;
    if (/海外|overseas|第三方|third/i.test(type)) {
      const mp = guessMarketplace(wh?.country) ?? guessMarketplace(whName);
      if (!mp) {
        warnings.add("overseas_no_marketplace", "海外仓无法识别国家，库存已跳过", whName);
        continue;
      }
      inv(touch(sku, mp)).overseas_wh += qty;
      continue;
    }
    if (!wh) warnings.add("warehouse_unknown", "仓库在仓库列表中找不到，按国内仓处理", whName);
    const mp = mpOfStore(r.seller_id) ?? primaryMarketplace(sku);
    if (!mp) {
      warnings.add("domestic_no_listing", "国内仓有库存但该 SKU 没有任何站点的 Listing 或销量，已跳过", sku);
      continue;
    }
    if (!mpOfStore(r.seller_id)) {
      warnings.add("domestic_primary", "国内仓库存未绑定店铺，已计入该 SKU 近期销量最高的站点", `${sku} → ${mp}`);
    }
    inv(touch(sku, mp)).domestic_wh += qty;
  }

  // Purchase orders that are approved or placed and still awaiting delivery count as "in production".
  for (const po of snap.purchaseOrders) {
    const status = num(po.status);
    if (status !== 1 && status !== 2) continue;
    for (const it of (po.item_list as Row[] | undefined) ?? []) {
      if (num(it.is_delete) === 1) continue;
      const qty = num(it.quantity_receive);
      const sku = localSku(it);
      if (!sku || qty <= 0) continue;
      const mp = mpOfStore(it.sid) ?? primaryMarketplace(sku);
      if (!mp) {
        warnings.add("po_no_listing", "采购单中的 SKU 没有任何站点的 Listing 或销量，在产数量已跳过", `${str(po.order_sn)} ${sku}`);
        continue;
      }
      inv(touch(sku, mp)).in_production += qty;
    }
  }

  // SKU master rows for every SKU x marketplace seen above.
  const skus: SyncedSku[] = [];
  for (const m of skuMeta.values()) {
    const p = products.get(m.sku);
    if (!p) warnings.add("sku_not_in_products", "SKU 不在 ERP 产品列表中，箱规、起订量和生产周期使用默认值", m.sku);
    skus.push({
      sku: m.sku,
      marketplace: m.marketplace,
      asin: m.asin,
      name: str(p?.name) || m.name || m.sku,
      category: str(p?.category) || null,
      owner: str(p?.owner) || str(p?.developer) || null,
      unit_cost: optNum(p?.cost),
      case_pack: optNum(p?.default_carton_qty) || null,
      moq: optNum(p?.moq),
      production_days: optNum(p?.procurement_lead_days) || null,
    });
  }

  return {
    skus,
    inventory,
    sales,
    shipments: [...shipAgg.values()],
    orders,
    storeMarketplaces,
    warnings: warnings.list(),
  };
}
