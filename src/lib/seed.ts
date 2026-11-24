import type { Query } from "./db";
import { addDays, todayStr } from "./dates";
import { chunkText } from "./kb-text";
import { DEFAULT_REPLENISHMENT } from "./settings-defaults";
import { computePlan, promoFactor, type Promotion } from "./replenishment";
import { SAMPLE_DOCS } from "./seed-data/kb";
import { MARKET_MULTIPLIER, SAMPLE_PRODUCTS, scenarioDays } from "./seed-data/products";
import { SAMPLE_ORDERS, SAMPLE_TICKETS } from "./seed-data/tickets";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fourthThursdayOfNovember(year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const offset = (4 - first + 7) % 7;
  return new Date(Date.UTC(year, 10, 1 + offset + 21)).toISOString().slice(0, 10);
}

export function samplePromotions(today: string): Promotion[] {
  const year = Number(today.slice(0, 4));
  const peakYear = today > `${year}-12-20` ? year + 1 : year;
  const thanksgiving = fourthThursdayOfNovember(peakYear);
  const bfStart = addDays(thanksgiving, -7);
  const bfEnd = addDays(thanksgiving, 5);
  return [
    { name: "秋季会员大促", marketplace: null, start_date: `${year}-10-07`, end_date: `${year}-10-08`, factor: 2 },
    { name: "黑五网一大促", marketplace: null, start_date: bfStart, end_date: bfEnd, factor: 1.8 },
    { name: "圣诞旺季", marketplace: null, start_date: addDays(bfEnd, 1), end_date: `${peakYear}-12-20`, factor: 1.3 },
    { name: "春季大促（日期待官方公布）", marketplace: "US", start_date: `${peakYear + 1}-03-20`, end_date: `${peakYear + 1}-03-26`, factor: 1.4 },
  ];
}

const LEAD_TIMES: Record<string, { production: number; sea: number; air: number; receiving: number }> = {
  US: { production: 20, sea: 30, air: 8, receiving: 10 },
  EU: { production: 20, sea: 40, air: 10, receiving: 10 },
};

const STOCKOUT_HISTORY: Record<string, [number, number]> = {
  "EL-CBL-006|US": [9, 12],
  "HK-BOT-001|DE": [15, 20],
};

function asinFor(rand: () => number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "B0";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}

function shipmentNo(rand: () => number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let s = "FBA18";
  for (let i = 0; i < 7; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}

export async function clearBusinessData(q: Query) {
  await q("delete from replenishment_decisions");
  await q("delete from shipments");
  await q("delete from daily_sales");
  await q("delete from inventory");
  await q("delete from skus");
  await q("delete from orders");
  await q("delete from tickets");
}

export async function seedSampleData(q: Query) {
  const today = todayStr();
  const rand = mulberry32(20261124);

  const existingPromos = await q<{ n: number }>("select count(*)::int as n from promotions");
  if (Number(existingPromos[0]?.n ?? 0) === 0) {
    for (const p of samplePromotions(today)) {
      await q(
        "insert into promotions (name, marketplace, start_date, end_date, factor) values ($1, $2, $3, $4, $5)",
        [p.name, p.marketplace, p.start_date, p.end_date, p.factor],
      );
    }
  }
  const promos = await q<Promotion>(
    "select name, marketplace, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, factor::float8 as factor from promotions",
  );

  for (const product of SAMPLE_PRODUCTS) {
    const asin = asinFor(rand);
    for (const [market, scenario] of Object.entries(product.markets)) {
      if (!scenario) continue;
      const lt = market === "US" ? LEAD_TIMES.US : LEAD_TIMES.EU;
      const inserted = await q<{ id: number }>(
        `insert into skus (sku, marketplace, asin, name, category, owner, unit_cost, case_pack, moq,
           production_days, sea_days, air_days, receiving_days)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [
          product.sku,
          market,
          asin,
          product.name,
          product.category,
          product.owner,
          product.unitCost,
          product.casePack,
          market === "US" ? product.moq : 0,
          lt.production,
          lt.sea,
          lt.air,
          lt.receiving,
        ],
      );
      const skuId = inserted[0].id;

      const base = product.usDaily * MARKET_MULTIPLIER[market];
      const outRange = STOCKOUT_HISTORY[`${product.sku}|${market}`];
      const dates: string[] = [];
      const units: number[] = [];
      const inStock: boolean[] = [];
      for (let i = 90; i >= 1; i--) {
        const date = addDays(today, -i);
        const progress = i / 89;
        const season =
          product.season === "winter" ? 1 - 0.45 * progress : product.season === "summer" ? 1 + 2 * progress : 1 - 0.05 * progress;
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        const weekday = dow === 0 || dow === 6 ? 1.12 : 0.96;
        const noise = 0.75 + rand() * 0.5;
        const out = outRange ? i >= outRange[0] && i <= outRange[1] : false;
        const value = out ? 0 : Math.max(0, Math.round(base * season * weekday * noise * promoFactor(date, market, promos)));
        dates.push(date);
        units.push(value);
        inStock.push(!out);
      }
      await q(
        `insert into daily_sales (sku_id, date, units, in_stock)
         select $1, d, u, s from unnest($2::date[], $3::int[], $4::bool[]) as t(d, u, s)`,
        [skuId, dates, units, inStock],
      );

      const skuRow = {
        id: skuId,
        sku: product.sku,
        marketplace: market,
        name: product.name,
        unit_cost: product.unitCost,
        case_pack: product.casePack,
        moq: 0,
        production_days: lt.production,
        sea_days: lt.sea,
        air_days: lt.air,
        receiving_days: lt.receiving,
      };
      const zeroInv = { fba_available: 0, fba_inbound: 0, in_transit: 0, overseas_wh: 0, domestic_wh: 0, in_production: 0, aged_qty: 0 };
      const history = dates.map((d, idx) => ({ date: d, units: units[idx], in_stock: inStock[idx] }));
      const { baseDaily } = computePlan(skuRow, zeroInv, history, promos, DEFAULT_REPLENISHMENT, today);
      const demand = (from: number, to: number) => {
        let total = 0;
        for (let d = from; d < to; d++) total += baseDaily * promoFactor(addDays(today, d), market, promos);
        return Math.round(total);
      };

      const leadTime = lt.production + lt.sea + lt.receiving;
      const seaLead = lt.sea + lt.receiving;
      const days = scenarioDays(scenario, leadTime, seaLead);
      const sellable = demand(0, days.sellable) + Math.round(baseDaily * 0.5);
      const domestic = days.domestic > 0 ? demand(days.sellable, days.sellable + days.domestic) : 0;
      const production =
        days.production > 0
          ? demand(days.sellable + days.domestic, days.sellable + days.domestic + days.production)
          : 0;

      const isEu = market !== "US";
      const fbaAvailable = Math.round(sellable * (isEu ? 0.5 : 0.6));
      const fbaInbound = Math.round(sellable * 0.08);
      const overseas = isEu ? Math.round(sellable * 0.15) : 0;
      const inTransit = Math.max(0, sellable - fbaAvailable - fbaInbound - overseas);
      const aged = Math.round(sellable * days.aged);

      await q(
        `insert into inventory (sku_id, fba_available, fba_inbound, in_transit, overseas_wh, domestic_wh, in_production, aged_qty, snapshot_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [skuId, fbaAvailable, fbaInbound, inTransit, overseas, domestic, production, aged, today],
      );

      if (inTransit > 0) {
        const split = inTransit > 300 && rand() > 0.4 ? [0.55, 0.45] : [1];
        let remaining = inTransit;
        for (let s = 0; s < split.length; s++) {
          const qty = s === split.length - 1 ? remaining : Math.round(inTransit * split[s]);
          remaining -= qty;
          const shipDate = addDays(today, -(5 + Math.floor(rand() * Math.max(1, lt.sea - 10))));
          let eta = addDays(shipDate, lt.sea);
          if (eta <= addDays(today, 1)) eta = addDays(today, 2 + Math.floor(rand() * 8));
          await q(
            "insert into shipments (shipment_no, sku_id, qty, method, status, ship_date, eta) values ($1,$2,$3,'sea','运输中',$4,$5)",
            [shipmentNo(rand), skuId, qty, shipDate, eta],
          );
        }
      }
      if (fbaInbound > 0) {
        await q(
          "insert into shipments (shipment_no, sku_id, qty, method, status, ship_date, eta) values ($1,$2,$3,'sea','已到仓·入库中',$4,$5)",
          [shipmentNo(rand), skuId, fbaInbound, addDays(today, -(lt.sea + 4)), addDays(today, -(1 + Math.floor(rand() * 4)))],
        );
      }
    }
  }

  for (const o of SAMPLE_ORDERS) {
    await q(
      `insert into orders (order_id, marketplace, sku, customer_name, purchase_date, carrier, tracking_no, shipping_status, est_delivery)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (order_id) do nothing`,
      [
        o.order_id,
        o.marketplace,
        o.sku,
        o.customer_name,
        addDays(today, o.purchase_offset),
        o.carrier,
        o.tracking_no,
        o.shipping_status,
        addDays(today, o.delivery_offset),
      ],
    );
  }

  const now = Date.now();
  for (const t of SAMPLE_TICKETS) {
    await q(
      `insert into tickets (channel, marketplace, order_id, customer_name, customer_email, subject, body, translation_zh, status, received_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9)`,
      [
        t.channel,
        t.marketplace,
        t.order_id,
        t.customer_name,
        t.customer_email,
        t.subject,
        t.body,
        t.translation_zh,
        new Date(now - t.hours_ago * 3_600_000).toISOString(),
      ],
    );
  }
}

export async function seedSampleDocs(q: Query) {
  await q("delete from kb_documents where is_sample = true");
  for (const doc of SAMPLE_DOCS) {
    const chunks = chunkText(doc.content);
    const inserted = await q<{ id: number }>(
      `insert into kb_documents (title, category, filename, char_count, chunk_count, uploaded_by, is_sample)
       values ($1,$2,$3,$4,$5,'系统示例',true) returning id`,
      [doc.title, doc.category, `${doc.title}.md`, doc.content.length, chunks.length],
    );
    for (let i = 0; i < chunks.length; i++) {
      await q("insert into kb_chunks (document_id, idx, heading, content) values ($1,$2,$3,$4)", [
        inserted[0].id,
        i,
        chunks[i].heading,
        chunks[i].content,
      ]);
    }
  }
}

export async function seedIfEmpty(q: Query, withTx: <R>(fn: (q: Query) => Promise<R>) => Promise<R>) {
  const claimed = await q(
    "insert into app_meta (key, value) values ('seeded', now()::text) on conflict (key) do nothing returning key",
  );
  if (claimed.length === 0) return;
  try {
    await withTx(async (tx) => {
      await seedSampleData(tx);
      await seedSampleDocs(tx);
    });
  } catch (error) {
    await q("delete from app_meta where key = 'seeded'");
    throw error;
  }
}
