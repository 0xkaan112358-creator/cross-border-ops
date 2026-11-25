import { normalizeMarketplace, type Marketplace } from "../constants";
import { addDays } from "../dates";

type Row = Record<string, unknown>;

export type ErpSnapshot = {
  products: Row[];
  warehouses: Row[];
  fbaStock: Row[];
  localStock: Row[];
  purchaseOrders: Row[];
  /** Shipment headers from REST /api/v1/shipments (no SKU lines). */
  shipments: Row[];
  /** FBA delivery orders from REST /api/v1/fba-delivery-orders; carry shipment_id and the SKU lines. */
  deliveryOrders: Row[];
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
  /** Units counted per raw status, to check the in-production and in-transit totals against the ERP. */
  diagnostics: Record<string, [string, number][]>;
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

const ORDER_STATUS: Record<string, string> = {
  shipped: "已发货",
  已发货: "已发货",
  partiallyshipped: "部分发货",
  部分发货: "部分发货",
  unshipped: "待发货",
  pending: "待发货",
  pendingavailability: "待发货",
  待发货: "待发货",
  待审核: "待审核",
  canceled: "已取消",
  cancelled: "已取消",
  已取消: "已取消",
};

export function normalizeOrderStatus(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  return ORDER_STATUS[s.toLowerCase().replace(/[\s_-]/g, "")] ?? s;
}

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

const SHIPMENT_VOID = /取消|作废|删除|草稿|cancel|void|deleted|draft/i;
const SHIPMENT_NOT_SHIPPED = /待发|未发|待配|待出库|待审|计划|working|plan/i;
const SHIPMENT_SHIPPED = /已发|运输|在途|shipped|in.?transit/i;
const SHIPMENT_DONE = /已完成|已关闭|完结|closed|completed/i;
const SHIPMENT_ARRIVED = /签收|到仓|收货|接收|入库|receiv|checked.?in|delivered/i;

/** Numeric purchase-order status (1 待下单, 2 待到货) from its text, for ERPs that only send status_text. */
function purchaseStatusFromText(text: unknown) {
  const t = str(text);
  if (/待到货|待签收|部分入库|部分到货/.test(t)) return 2;
  if (/待下单/.test(t)) return 1;
  return 0;
}

const RECEIVED_KEYS = ["received_qty", "quantity_received", "receive_qty", "receive_num"];
const hasAny = (row: Row, keys: string[]) => keys.some((k) => row[k] != null && str(row[k]) !== "");

/** First field present (non-empty) among the candidates, as a number; 0 when none. */
function firstNum(row: Row, keys: string[]) {
  for (const k of keys) if (row[k] != null && str(row[k]) !== "") return num(row[k]);
  return 0;
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
  for (const f of snap.fbaStock) hint(f.sid, f.seller_group_name || f.name, "", "FBA库存");
  for (const [, e] of stores) {
    if (e.votes.size === 0) {
      const mp = guessMarketplace(e.name);
      if (mp) {
        e.votes.set(mp, 1);
        e.source = "店铺名称";
      }
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
    const mapped = normalizeOrderStatus(status);
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
    if (mapped === "已取消" || !date || date < salesStart || date >= today) continue;
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
    mp ??= guessMarketplace(f.name) ?? guessMarketplace(f.seller_group_name);
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

  // In-transit FBA shipments: headers (country, ETA, carrier) joined by shipment_id with delivery orders (SKU lines).
  // Quantity still on the way = shipped - received, per line.
  const storeByName = new Map<string, Marketplace | null>();
  for (const st of storeMarketplaces) if (st.name) storeByName.set(st.name, st.marketplace);
  const headerById = new Map<string, Row>();
  for (const h of snap.shipments) if (str(h.shipment_id)) headerById.set(str(h.shipment_id), h);
  const coveredHeaders = new Set<string>();
  const shipAgg = new Map<string, SyncedShipment>();
  const inTransitByStatus = new Map<string, number>();
  const outcomes = new Map<string, { orders: number; shipped: number; received: number }>();
  for (const d of snap.deliveryOrders) {
    const outcome = (reason: string) => {
      const k = `${str(d.status_text) || "（空）"}｜${reason}`;
      const o = outcomes.get(k) ?? { orders: 0, shipped: 0, received: 0 };
      o.orders++;
      o.shipped += num(d.shipped_qty);
      o.received += num(d.received_qty);
      outcomes.set(k, o);
    };
    const shipmentId = str(d.shipment_id);
    const h = headerById.get(shipmentId);
    if (h) coveredHeaders.add(shipmentId);
    const statusText = `${str(d.status_text)} ${str(h?.status_text)} ${str(h?.amazon_status)}`;
    const statusKey = str(d.status_text) || "（空）";
    const label = shipmentId || str(d.delivery_order_no) || `发货单 ${str(d.id)}`;
    if (SHIPMENT_VOID.test(statusText)) {
      outcome("已取消/作废");
      continue;
    }
    if (SHIPMENT_DONE.test(statusText)) {
      outcome("已完成/已关闭");
      continue;
    }
    const shipped = dateOf(d.shipped_at) != null || (SHIPMENT_SHIPPED.test(statusText) && !SHIPMENT_NOT_SHIPPED.test(str(d.status_text)));
    if (!shipped) {
      outcome("未发货");
      continue;
    }
    const items = ((d.item_list as Row[] | undefined) ?? []).map((it) => ({
      it,
      sku: localSku(it, "msku", "seller_sku"),
      shipped: firstNum(it, ["shipped_qty", "quantity_shipped", "ship_qty", "quantity", "qty", "num"]),
      received: hasAny(it, RECEIVED_KEYS) ? firstNum(it, RECEIVED_KEYS) : null,
    }));
    if (!items.length) {
      outcome("没有商品明细");
      warnings.add("delivery_no_items", "FBA 发货单没有商品明细，未计入在途货件", label);
      continue;
    }
    // Lines without their own received quantity share the order's (shipped - received) in proportion to quantity.
    const lineShipped = items.reduce((a, x) => a + x.shipped, 0);
    const orderShipped = num(d.shipped_qty) || lineShipped;
    const orderLeft = Math.max(0, orderShipped - num(d.received_qty));
    const shares = items.every((x) => x.received != null)
      ? items.map((x) => Math.max(0, x.shipped - (x.received ?? 0)))
      : lineShipped > 0
        ? splitByWeight(Math.min(orderLeft, lineShipped), items.map((x) => x.shipped))
        : items.map(() => 0);
    const left = shares.reduce((a, b) => a + b, 0);
    if (left <= 0) {
      outcome("已收完");
      continue;
    }
    const mp =
      guessMarketplace(h?.country) ??
      guessMarketplace(h?.site) ??
      guessMarketplace(h?.destination) ??
      (storeByName.get(str(d.store_name)) || null) ??
      guessMarketplace(d.store_name) ??
      guessMarketplace(d.destination);
    if (!mp) {
      outcome("无法识别站点");
      warnings.add("shipment_no_marketplace", "货件无法识别站点（货件的国家/站点/目的地和发货单店铺都没有国家信息），已跳过", label);
      continue;
    }
    outcome("计入在途");
    inTransitByStatus.set(statusKey, (inTransitByStatus.get(statusKey) ?? 0) + left);
    const arrived = num(d.received_qty) > 0 || SHIPMENT_ARRIVED.test(statusText);
    const method = shipMethod(`${str(h?.shipment_type)} ${str(h?.logistics_channel)} ${str(h?.carrier)} ${str(d.carrier)}`);
    const shipDate = dateOf(d.shipped_at) ?? dateOf(h?.expected_ship_date);
    const eta = dateOf(h?.expected_arrival_date);
    items.forEach((x, i) => {
      const qty = shares[i];
      if (!x.sku || qty <= 0) return;
      touch(x.sku, mp, x.it.asin, x.it.product_name ?? x.it.name);
      const k = `${label}|${x.sku}|${mp}`;
      const cur = shipAgg.get(k);
      if (cur) cur.qty += qty;
      else
        shipAgg.set(k, {
          shipment_no: label,
          sku: x.sku,
          marketplace: mp,
          qty,
          method,
          status: arrived || (x.received ?? 0) > 0 ? "已到仓·入库中" : "运输中",
          ship_date: shipDate,
          eta,
        });
    });
  }
  for (const [id, h] of headerById) {
    const statusText = `${str(h.status_text)} ${str(h.amazon_status)}`;
    if (coveredHeaders.has(id) || SHIPMENT_VOID.test(statusText) || SHIPMENT_DONE.test(statusText)) continue;
    warnings.add("shipment_no_delivery", "货件没有对应的 FBA 发货单，拿不到 SKU 明细，未计入在途货件", `${id}（${str(h.status_text) || "无状态"}）`);
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
    const whName = str(wh?.name) || (str(r.wid) ? `仓库 ID ${str(r.wid)}` : "（明细没有仓库 ID）");
    if (/fba|亚马逊|amazon/i.test(type)) continue;
    // Country decides first: a warehouse located in a marketplace country is overseas stock for that marketplace,
    // whatever its type label (海外仓 / 自营仓 / 平台仓); one in China is domestic.
    const countryMp = guessMarketplace(wh?.country);
    const inChina = /^(cn|chn|china|中国|中国大陆)$/i.test(str(wh?.country));
    if (countryMp || (!inChina && /海外|overseas|第三方|third/i.test(type))) {
      const mp = countryMp ?? guessMarketplace(whName);
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

  // Purchase orders that are approved (1 待下单) or placed (2 待到货) count as "in production" with their
  // awaiting-delivery quantity. Some ERPs leave the numeric status empty and only send status_text.
  const pendingByStatus = new Map<string, number>();
  for (const po of snap.purchaseOrders) {
    const statusKey = `${str(po.status) || "（空）"} ${str(po.status_text)}`.trim();
    const status = str(po.status) !== "" ? num(po.status) : purchaseStatusFromText(po.status_text);
    const lines = ((po.item_list as Row[] | undefined) ?? []).filter((it) => num(it.is_delete) !== 1);
    pendingByStatus.set(statusKey, (pendingByStatus.get(statusKey) ?? 0) + lines.reduce((a, it) => a + num(it.quantity_receive), 0));
    if (status !== 1 && status !== 2) continue;
    for (const it of lines) {
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

  const ranked = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    skus,
    inventory,
    sales,
    shipments: [...shipAgg.values()],
    orders,
    storeMarketplaces,
    warnings: warnings.list(),
    diagnostics: {
      "采购单待到货件数按状态（计入在产：待下单、待到货、部分入库）": ranked(pendingByStatus),
      "FBA发货单计入在途的件数按状态": ranked(inTransitByStatus),
      "FBA发货单处理结果（张数；括号内为整单已发/已收件数合计）": [...outcomes.entries()]
        .sort((a, b) => b[1].orders - a[1].orders)
        .map(([k, o]) => [`${k}（已发 ${o.shipped} / 已收 ${o.received}）`, o.orders]),
    },
  };
}
