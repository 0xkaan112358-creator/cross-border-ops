import "server-only";
import * as XLSX from "xlsx";
import { normalizeMarketplace } from "./constants";
import { sql, tx } from "./db";
import { todayStr } from "./dates";

export const IMPORT_TYPES = ["skus", "inventory", "sales", "shipments", "orders", "tickets"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

type FieldType = "string" | "int" | "number" | "date" | "bool" | "marketplace" | "method";
type FieldDef = { key: string; label: string; aliases?: string[]; required?: boolean; type: FieldType; note?: string };

export const IMPORT_DEFS: Record<
  ImportType,
  { title: string; description: string; fields: FieldDef[]; examples: (string | number)[][] }
> = {
  skus: {
    title: "SKU 主数据",
    description: "SKU、站点、品名、箱规、起订量和各段时效。同一 SKU 在不同站点各占一行。",
    fields: [
      { key: "sku", label: "SKU", aliases: ["msku", "seller sku", "seller-sku", "sku编码"], required: true, type: "string" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace", "country", "site"], required: true, type: "marketplace", note: "US/UK/DE/FR/IT/ES 或 美国/德国 等" },
      { key: "asin", label: "ASIN", type: "string" },
      { key: "name", label: "品名", aliases: ["产品名称", "商品名称", "名称", "product name", "title"], required: true, type: "string" },
      { key: "category", label: "类目", aliases: ["分类", "category"], type: "string" },
      { key: "owner", label: "负责人", aliases: ["运营", "业务员", "owner"], type: "string" },
      { key: "unit_cost", label: "采购单价", aliases: ["采购价", "成本", "单价", "unit cost"], type: "number", note: "人民币，用于估算冗余库存金额" },
      { key: "case_pack", label: "箱规", aliases: ["装箱数", "每箱数量", "case pack"], type: "int" },
      { key: "moq", label: "最小起订量", aliases: ["起订量", "moq"], type: "int" },
      { key: "production_days", label: "生产周期(天)", aliases: ["生产周期", "采购周期", "生产天数"], type: "int" },
      { key: "sea_days", label: "海运时效(天)", aliases: ["海运时效", "海运天数", "头程时效"], type: "int" },
      { key: "air_days", label: "空运时效(天)", aliases: ["空运时效", "空运天数"], type: "int" },
      { key: "receiving_days", label: "上架时效(天)", aliases: ["上架时效", "入库时效", "上架天数"], type: "int" },
    ],
    examples: [
      ["HK-BOT-001", "US", "B0EXAMPLE1", "不锈钢真空保温杯 750ml", "家居厨房", "张婷", 32, 24, 480, 20, 30, 8, 10],
      ["HK-BOT-001", "DE", "B0EXAMPLE1", "不锈钢真空保温杯 750ml", "家居厨房", "张婷", 32, 24, 0, 20, 40, 10, 10],
    ],
  },
  inventory: {
    title: "库存快照",
    description: "每个 SKU 当前各环节的库存数量。每次导入视为最新快照，未填写的数量按 0 处理。",
    fields: [
      { key: "sku", label: "SKU", aliases: ["msku", "seller sku", "seller-sku"], required: true, type: "string" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace", "country"], required: true, type: "marketplace" },
      { key: "fba_available", label: "FBA可售", aliases: ["可售", "可售数量", "fba可售数量", "fulfillable", "afn-fulfillable-quantity", "available"], type: "int" },
      { key: "fba_inbound", label: "FBA入库中", aliases: ["入库中", "接收中", "待上架", "afn-inbound-receiving-quantity"], type: "int" },
      { key: "in_transit", label: "头程在途", aliases: ["在途", "在途数量", "fba在途", "in transit", "afn-inbound-shipped-quantity"], type: "int" },
      { key: "overseas_wh", label: "海外仓", aliases: ["海外仓库存", "第三方仓", "海外仓可用"], type: "int" },
      { key: "domestic_wh", label: "国内仓", aliases: ["国内仓库存", "本地仓", "国内库存"], type: "int" },
      { key: "in_production", label: "在产", aliases: ["采购在途", "未交货", "在制", "采购未到货", "in production"], type: "int" },
      { key: "aged_qty", label: "超龄库存", aliases: ["库龄超180天", "库龄>180天", "aged"], type: "int", note: "库龄超过 180 天的数量" },
      { key: "snapshot_date", label: "快照日期", aliases: ["日期", "统计日期"], type: "date", note: "默认今天" },
    ],
    examples: [
      ["HK-BOT-001", "US", 2200, 300, 1100, 0, 900, 700, 0, ""],
      ["HK-BOT-001", "DE", 900, 120, 450, 280, 0, 0, 0, ""],
    ],
  },
  sales: {
    title: "每日销量",
    description: "每个 SKU 每天的销量，至少提供最近 30 天。断货当天请把“是否有货”填为“否”，系统会剔除断货日。",
    fields: [
      { key: "sku", label: "SKU", aliases: ["msku", "seller sku", "seller-sku"], required: true, type: "string" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace", "country"], required: true, type: "marketplace" },
      { key: "date", label: "日期", aliases: ["销售日期", "date"], required: true, type: "date" },
      { key: "units", label: "销量", aliases: ["销售数量", "订单数量", "units", "units ordered"], required: true, type: "int" },
      { key: "in_stock", label: "是否有货", aliases: ["有货", "在售", "in stock"], type: "bool", note: "是/否，默认是" },
    ],
    examples: [
      ["HK-BOT-001", "US", "2026-11-20", 48, "是"],
      ["HK-BOT-001", "US", "2026-11-21", 0, "否"],
    ],
  },
  shipments: {
    title: "在途货件",
    description: "头程货件明细，用于查询到货时间。一票货件含多个 SKU 时每个 SKU 一行。",
    fields: [
      { key: "shipment_no", label: "货件号", aliases: ["fba货件号", "shipment id", "货件编号", "单号"], required: true, type: "string" },
      { key: "sku", label: "SKU", aliases: ["msku", "seller sku"], required: true, type: "string" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace"], required: true, type: "marketplace" },
      { key: "qty", label: "数量", aliases: ["发货数量", "quantity"], required: true, type: "int" },
      { key: "method", label: "运输方式", aliases: ["物流方式", "method"], type: "method", note: "海运/空运/铁路/快递" },
      { key: "status", label: "状态", aliases: ["货件状态", "status"], type: "string", note: "如 运输中、已到仓·入库中" },
      { key: "ship_date", label: "发货日期", aliases: ["发货时间"], type: "date" },
      { key: "eta", label: "预计到达", aliases: ["预计到仓", "eta", "预计到货"], type: "date" },
    ],
    examples: [
      ["FBA18EXAMPLE", "HK-BOT-001", "US", 600, "海运", "运输中", "2026-11-05", "2026-12-08"],
      ["FBA18EXAMPL2", "HK-BOT-001", "DE", 240, "铁路", "运输中", "2026-11-10", "2026-12-12"],
    ],
  },
  orders: {
    title: "订单物流",
    description: "客服回复物流查询时使用的订单和追踪信息。",
    fields: [
      { key: "order_id", label: "订单号", aliases: ["amazon订单号", "order id", "order-id"], required: true, type: "string" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace"], type: "marketplace" },
      { key: "sku", label: "SKU", aliases: ["msku", "seller sku"], type: "string" },
      { key: "customer_name", label: "客户姓名", aliases: ["买家姓名", "buyer name", "收件人"], type: "string" },
      { key: "purchase_date", label: "下单日期", aliases: ["订购日期", "purchase date"], type: "date" },
      { key: "carrier", label: "承运商", aliases: ["物流商", "carrier"], type: "string" },
      { key: "tracking_no", label: "追踪号", aliases: ["运单号", "tracking number", "跟踪号"], type: "string" },
      { key: "shipping_status", label: "物流状态", aliases: ["状态", "status"], type: "string", note: "运输中/派送中/已签收/延误" },
      { key: "est_delivery", label: "预计送达", aliases: ["预计送达日期", "预计到达"], type: "date" },
    ],
    examples: [
      ["113-1234567-1234567", "US", "HK-BOT-001", "Emily Carter", "2026-11-18", "UPS", "1Z9999999999999999", "运输中", "2026-11-26"],
      ["302-1234567-7654321", "DE", "SP-YOG-008", "Thomas Becker", "2026-11-16", "DHL", "00340434161094000000", "延误", "2026-11-23"],
    ],
  },
  tickets: {
    title: "客服消息",
    description: "需要 AI 分拣的客户消息。导入后系统会自动分类、翻译并生成回复草稿。",
    fields: [
      { key: "channel", label: "渠道", aliases: ["来源", "channel"], type: "string", note: "如 Amazon 买家消息、邮件" },
      { key: "marketplace", label: "站点", aliases: ["国家", "市场", "marketplace"], type: "marketplace" },
      { key: "order_id", label: "订单号", aliases: ["order id"], type: "string" },
      { key: "customer_name", label: "客户姓名", aliases: ["买家姓名", "姓名", "name"], type: "string" },
      { key: "customer_email", label: "客户邮箱", aliases: ["邮箱", "email"], type: "string" },
      { key: "subject", label: "主题", aliases: ["标题", "subject"], type: "string" },
      { key: "body", label: "内容", aliases: ["消息内容", "正文", "message", "body"], required: true, type: "string" },
    ],
    examples: [
      ["Amazon 买家消息", "US", "113-1234567-1234567", "Emily Carter", "", "Where is my order?", "Hi, when will my order arrive? Thanks"],
      ["邮件", "DE", "", "Lena Wagner", "", "Frage", "Hallo, wie reinige ich die Yogamatte?"],
    ],
  },
};

function normHeader(h: string) {
  return h.toLowerCase().replace(/[\s()（）_\-:：]/g, "");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(String(v).trim());
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  throw new Error(`日期格式无法识别：${String(v)}`);
}

function parseValue(field: FieldDef, raw: unknown): unknown {
  const empty = raw == null || (typeof raw === "string" && raw.trim() === "");
  if (empty) {
    if (field.required) throw new Error(`"${field.label}"不能为空`);
    return null;
  }
  switch (field.type) {
    case "string":
      return String(raw).trim();
    case "int":
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,，\s]/g, ""));
      if (!Number.isFinite(n)) throw new Error(`"${field.label}"应为数字：${String(raw)}`);
      return field.type === "int" ? Math.round(n) : n;
    }
    case "date":
      return parseDate(raw);
    case "bool": {
      const s = String(raw).trim().toLowerCase();
      if (["否", "n", "no", "false", "0", "断货", "无货"].includes(s)) return false;
      return true;
    }
    case "marketplace": {
      const m = normalizeMarketplace(raw);
      if (!m) throw new Error(`无法识别的站点：${String(raw)}`);
      return m;
    }
    case "method": {
      const s = String(raw).trim().toLowerCase();
      if (/空运|air/.test(s)) return "air";
      if (/铁路|卡航|rail|train/.test(s)) return "rail";
      if (/快递|express/.test(s)) return "express";
      return "sea";
    }
  }
}

export type ImportResult = { total: number; inserted: number; updated: number; errors: { row: number; message: string }[] };

export function parseSheet(type: ImportType, buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("文件中没有工作表");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
  const def = IMPORT_DEFS[type];
  const headerMap = new Map<string, FieldDef>();
  for (const f of def.fields) {
    for (const name of [f.label, f.key, ...(f.aliases ?? [])]) headerMap.set(normHeader(name), f);
  }
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const mapping = new Map<string, FieldDef>();
  for (const h of headers) {
    const f = headerMap.get(normHeader(h));
    if (f && ![...mapping.values()].includes(f)) mapping.set(h, f);
  }
  const missing = def.fields.filter((f) => f.required && ![...mapping.values()].includes(f));
  if (rows.length > 0 && missing.length) {
    throw new Error(`缺少必填列：${missing.map((f) => f.label).join("、")}。请使用模板中的列名。`);
  }
  const parsed: { row: number; data: Record<string, unknown> }[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((raw, i) => {
    const data: Record<string, unknown> = {};
    try {
      for (const f of def.fields) {
        const header = [...mapping.entries()].find(([, v]) => v === f)?.[0];
        data[f.key] = parseValue(f, header ? raw[header] : null);
      }
      parsed.push({ row: i + 2, data });
    } catch (error) {
      errors.push({ row: i + 2, message: error instanceof Error ? error.message : String(error) });
    }
  });
  return { parsed, errors, total: rows.length };
}

async function skuIdMap() {
  const rows = await sql<{ id: number; sku: string; marketplace: string }>("select id, sku, marketplace from skus");
  return new Map(rows.map((r) => [`${r.sku}|${r.marketplace}`, r.id]));
}

export async function runImport(type: ImportType, buffer: ArrayBuffer): Promise<ImportResult> {
  const { parsed, errors, total } = parseSheet(type, buffer);
  let inserted = 0;
  let updated = 0;
  const ids = type === "skus" || type === "orders" || type === "tickets" ? null : await skuIdMap();
  const today = todayStr();
  const pendingSales: { sku_id: number; date: string; units: number; in_stock: boolean }[] = [];

  const q = sql;
  {
    for (const { row, data: d } of parsed) {
      try {
        let skuId: number | undefined;
        if (ids) {
          skuId = ids.get(`${d.sku}|${d.marketplace}`);
          if (!skuId) throw new Error(`SKU ${String(d.sku)}（${String(d.marketplace)}）不存在，请先导入 SKU 主数据`);
        }
        if (type === "skus") {
          const r = await q<{ inserted: boolean }>(
            `insert into skus (sku, marketplace, asin, name, category, owner, unit_cost, case_pack, moq,
               production_days, sea_days, air_days, receiving_days, transit_source)
             values ($1, $2::text, $3, $4, $5, $6, coalesce($7::numeric, 0), coalesce($8::int, 1), coalesce($9::int, 0),
               coalesce($10::int, 20), coalesce($11::int, case when $2::text = 'US' then 30 else 40 end),
               coalesce($12::int, 10), coalesce($13::int, 10),
               case when $11::int is not null or $12::int is not null then 'manual' else 'default' end)
             on conflict (sku, marketplace) do update set
               asin = coalesce($3, skus.asin), name = $4, category = coalesce($5, skus.category),
               owner = coalesce($6, skus.owner), unit_cost = coalesce($7::numeric, skus.unit_cost),
               case_pack = coalesce($8::int, skus.case_pack), moq = coalesce($9::int, skus.moq),
               production_days = coalesce($10::int, skus.production_days), sea_days = coalesce($11::int, skus.sea_days),
               air_days = coalesce($12::int, skus.air_days), receiving_days = coalesce($13::int, skus.receiving_days),
               transit_source = case when $11::int is not null or $12::int is not null then 'manual' else skus.transit_source end,
               active = true, updated_at = now()
             returning (xmax = 0) as inserted`,
            [d.sku, d.marketplace, d.asin, d.name, d.category, d.owner, d.unit_cost, d.case_pack, d.moq, d.production_days, d.sea_days, d.air_days, d.receiving_days],
          );
          if (r[0]?.inserted) inserted++;
          else updated++;
        } else if (type === "inventory") {
          const r = await q<{ inserted: boolean }>(
            `insert into inventory (sku_id, fba_available, fba_inbound, in_transit, overseas_wh, domestic_wh, in_production, aged_qty, snapshot_date, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             on conflict (sku_id) do update set fba_available = $2, fba_inbound = $3, in_transit = $4, overseas_wh = $5,
               domestic_wh = $6, in_production = $7, aged_qty = $8, snapshot_date = $9, updated_at = now()
             returning (xmax = 0) as inserted`,
            [skuId, d.fba_available ?? 0, d.fba_inbound ?? 0, d.in_transit ?? 0, d.overseas_wh ?? 0, d.domestic_wh ?? 0, d.in_production ?? 0, d.aged_qty ?? 0, d.snapshot_date ?? today],
          );
          if (r[0]?.inserted) inserted++;
          else updated++;
        } else if (type === "sales") {
          pendingSales.push({ sku_id: skuId!, date: d.date as string, units: d.units as number, in_stock: (d.in_stock as boolean | null) ?? true });
        } else if (type === "shipments") {
          const r = await q<{ inserted: boolean }>(
            `insert into shipments (shipment_no, sku_id, qty, method, status, ship_date, eta)
             values ($1, $2, $3, coalesce($4, 'sea'), coalesce($5, '运输中'), $6, $7)
             on conflict (shipment_no, sku_id) do update set qty = $3, method = coalesce($4, shipments.method),
               status = coalesce($5, shipments.status), ship_date = coalesce($6, shipments.ship_date), eta = coalesce($7, shipments.eta)
             returning (xmax = 0) as inserted`,
            [d.shipment_no, skuId, d.qty, d.method, d.status, d.ship_date, d.eta],
          );
          if (r[0]?.inserted) inserted++;
          else updated++;
        } else if (type === "orders") {
          const r = await q<{ inserted: boolean }>(
            `insert into orders (order_id, marketplace, sku, customer_name, purchase_date, carrier, tracking_no, shipping_status, est_delivery, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             on conflict (order_id) do update set marketplace = coalesce($2, orders.marketplace), sku = coalesce($3, orders.sku),
               customer_name = coalesce($4, orders.customer_name), purchase_date = coalesce($5, orders.purchase_date),
               carrier = coalesce($6, orders.carrier), tracking_no = coalesce($7, orders.tracking_no),
               shipping_status = coalesce($8, orders.shipping_status), est_delivery = coalesce($9, orders.est_delivery), updated_at = now()
             returning (xmax = 0) as inserted`,
            [d.order_id, d.marketplace, d.sku, d.customer_name, d.purchase_date, d.carrier, d.tracking_no, d.shipping_status, d.est_delivery],
          );
          if (r[0]?.inserted) inserted++;
          else updated++;
        } else if (type === "tickets") {
          await q(
            `insert into tickets (channel, marketplace, order_id, customer_name, customer_email, subject, body, status)
             values (coalesce($1, '邮件'), $2, $3, $4, $5, $6, $7, 'new')`,
            [d.channel, d.marketplace, d.order_id, d.customer_name, d.customer_email, d.subject, d.body],
          );
          inserted++;
        }
      } catch (error) {
        errors.push({ row, message: error instanceof Error ? error.message : String(error) });
      }
    }

    const uniqueSales = [...new Map(pendingSales.map((s) => [`${s.sku_id}|${s.date}`, s])).values()];
    if (uniqueSales.length) {
      const r = await tx((t) =>
        t<{ inserted: boolean }>(
          `insert into daily_sales (sku_id, date, units, in_stock)
           select * from unnest($1::int[], $2::date[], $3::int[], $4::bool[])
           on conflict (sku_id, date) do update set units = excluded.units, in_stock = excluded.in_stock
           returning (xmax = 0) as inserted`,
          [uniqueSales.map((s) => s.sku_id), uniqueSales.map((s) => s.date), uniqueSales.map((s) => s.units), uniqueSales.map((s) => s.in_stock)],
        ),
      );
      for (const x of r) {
        if (x.inserted) inserted++;
        else updated++;
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);
  return { total, inserted, updated, errors: errors.slice(0, 100) };
}

export function buildTemplate(type: ImportType): Buffer {
  const def = IMPORT_DEFS[type];
  const wb = XLSX.utils.book_new();
  const data = [def.fields.map((f) => f.label), ...def.examples];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = def.fields.map((f) => ({ wch: Math.max(12, f.label.length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, def.title);
  const notes = XLSX.utils.aoa_to_sheet([
    ["列名", "是否必填", "说明", "也可识别的列名"],
    ...def.fields.map((f) => [f.label, f.required ? "必填" : "选填", f.note ?? "", (f.aliases ?? []).join("、")]),
  ]);
  notes["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 36 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, notes, "填写说明");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildWorkbook(sheetName: string, rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  if (rows.length) ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(10, k.length * 2 + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
