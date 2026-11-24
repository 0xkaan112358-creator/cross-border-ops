// Local stand-in for the ERP OpenAPI (Lingxing-style endpoints) used to exercise "从 ERP 同步" without real credentials.
// Usage: node scripts/mock-erp.mjs  → http://127.0.0.1:19437  (account mock-admin / mock-pass)
import http from "node:http";

const PORT = Number(process.env.MOCK_ERP_PORT || 19437);
// Optional cap on rows per page, to mimic servers that return fewer rows than the requested length.
const PAGE_CAP = Number(process.env.MOCK_ERP_PAGE_CAP || 0);
const USER = "mock-admin";
const PASS = "mock-pass";
const tokens = new Map();

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const daysAgo = (n) => ymd(new Date(Date.now() + 8 * 3600_000 - n * 86400_000));

const stores = [
  { sid: 101, name: "Acme-US", channel: "Amazon.com", nation: "美国" },
  { sid: 102, name: "Acme-UK", channel: "Amazon.co.uk", nation: "英国" },
  { sid: 103, name: "Acme-DE", channel: "Amazon.de", nation: "德国" },
  { sid: 104, name: "Acme-FR", channel: "Amazon.fr", nation: "法国" },
  { sid: 105, name: "Acme-JP", channel: "Amazon.co.jp", nation: "日本" },
];

const products = [
  { id: 1, sku: "BOT-750", name: "不锈钢真空保温杯 750ml", category: "家居厨房", owner: "张婷", cost: 32, moq: 500, procurement_lead_days: 25, default_carton_qty: 24, status: "在售" },
  { id: 2, sku: "YOGA-6MM", name: "TPE 瑜伽垫 6mm", category: "运动户外", owner: "李明", cost: 41, moq: 300, procurement_lead_days: 18, default_carton_qty: 10, status: "在售" },
  { id: 3, sku: "LAMP-01", name: "LED 护眼台灯", category: "家居照明", owner: "王芳", cost: 58, moq: 200, procurement_lead_days: 30, default_carton_qty: 12, status: "在售" },
];

const warehouses = [
  { id: 1, warehouse_code: "SZ01", name: "深圳本地仓", warehouse_type: "本地仓", country: "中国", status_text: "启用" },
  { id: 2, warehouse_code: "USW1", name: "美西海外仓", warehouse_type: "海外仓", country: "美国", status_text: "启用" },
  { id: 3, warehouse_code: "DE01", name: "德国海外仓", warehouse_type: "海外仓", country: "德国", status_text: "启用" },
];

const fbaStock = [
  { sid: 101, name: "Acme-US美国仓", seller_sku: "BOT-750-US", sku: "BOT-750", asin: "B0MOCK0001", product_name: "保温杯", share_type: 0, afn_fulfillable_quantity: 820, reserved_fc_transfers: 40, reserved_fc_processing: 20, total_fulfillable_quantity: 880, afn_inbound_receiving_quantity: 120, afn_inbound_shipped_quantity: 600, inv_age_181_to_270_days: 30, inv_age_271_to_365_days: 0, inv_age_365_plus_days: 0 },
  { sid: 101, name: "Acme-US美国仓", seller_sku: "YOGA-6MM-US", sku: "YOGA-6MM", asin: "B0MOCK0002", product_name: "瑜伽垫", share_type: 0, afn_fulfillable_quantity: 95, reserved_fc_transfers: 0, reserved_fc_processing: 0, total_fulfillable_quantity: 95, afn_inbound_receiving_quantity: 0, afn_inbound_shipped_quantity: 0, inv_age_181_to_270_days: 0, inv_age_271_to_365_days: 0, inv_age_365_plus_days: 0 },
  { sid: 102, name: "Acme-UK英国仓", seller_sku: "BOT-750-UK", sku: "BOT-750", asin: "B0MOCK0001", product_name: "保温杯", share_type: 0, afn_fulfillable_quantity: 2600, total_fulfillable_quantity: 2600, afn_inbound_receiving_quantity: 0, afn_inbound_shipped_quantity: 0, inv_age_181_to_270_days: 400, inv_age_271_to_365_days: 300, inv_age_365_plus_days: 100 },
  {
    sid: 0, name: "欧洲共享仓", seller_sku: "LAMP-01-EU", sku: "LAMP-01", asin: "B0MOCK0003", product_name: "台灯", share_type: 2,
    afn_fulfillable_quantity: 300, total_fulfillable_quantity: 300, afn_inbound_receiving_quantity: 50, afn_inbound_shipped_quantity: 200,
    inv_age_181_to_270_days: 0, inv_age_271_to_365_days: 0, inv_age_365_plus_days: 0,
  },
  { sid: 105, name: "Acme-JP日本仓", seller_sku: "BOT-750-JP", sku: "BOT-750", asin: "B0MOCK0001", product_name: "保温杯", share_type: 0, afn_fulfillable_quantity: 50, total_fulfillable_quantity: 50 },
];

const localStock = [
  { wid: 1, sku: "BOT-750", seller_id: 0, product_valid_num: 900, product_onway: 0 },
  { wid: 1, sku: "YOGA-6MM", seller_id: 101, product_valid_num: 400, product_onway: 0 },
  { wid: 2, sku: "YOGA-6MM", seller_id: 0, product_valid_num: 150, product_onway: 0 },
  { wid: 3, sku: "LAMP-01", seller_id: 0, product_valid_num: 260, product_onway: 40 },
];

const purchaseOrders = [
  { order_sn: "PO-MOCK-001", status: 2, status_text: "待到货", item_list: [{ sku: "BOT-750", sid: 0, quantity_receive: 1200, is_delete: 0 }, { sku: "LAMP-01", sid: 103, quantity_receive: 300, is_delete: 0 }] },
  { order_sn: "PO-MOCK-002", status: 9, status_text: "已完成", item_list: [{ sku: "YOGA-6MM", sid: 101, quantity_receive: 0, is_delete: 0 }] },
  { order_sn: "PO-MOCK-003", status: -1, status_text: "作废", item_list: [{ sku: "YOGA-6MM", sid: 101, quantity_receive: 500, is_delete: 0 }] },
];

// REST shipment headers (no SKU lines) and FBA delivery orders (SKU lines), joined by shipment_id.
const shipments = [
  { id: 1, shipment_id: "FBA18MOCKUS1", shipment_type: "海运", country: "美国", site: "Amazon.com", destination: "ONT8", carrier: "美森", logistics_channel: "美森快船", status_text: "运输中", amazon_status: "SHIPPED", expected_ship_date: daysAgo(12), expected_arrival_date: daysAgo(-20), received_qty: 0 },
  { id: 2, shipment_id: "FBA18MOCKDE1", shipment_type: "空运", country: "德国", site: "Amazon.de", destination: "DTM2", carrier: "DHL", logistics_channel: "DHL 空派", status_text: "已签收", amazon_status: "RECEIVING", expected_ship_date: daysAgo(5), expected_arrival_date: daysAgo(-3), received_qty: 50 },
  { id: 3, shipment_id: "FBA18DONE", shipment_type: "海运", country: "美国", site: "Amazon.com", status_text: "已完成", amazon_status: "CLOSED", expected_arrival_date: daysAgo(10), received_qty: 999 },
  { id: 4, shipment_id: "FBA18CANCEL", shipment_type: "海运", country: "英国", status_text: "已取消", amazon_status: "CANCELLED", received_qty: 0 },
  { id: 5, shipment_id: "FBA18NOLINES", shipment_type: "海运", country: "美国", status_text: "运输中", expected_arrival_date: daysAgo(-15), received_qty: 0 },
];
const deliveryOrders = [
  { id: 1, delivery_order_no: "FD-MOCK-001", shipment_id: "FBA18MOCKUS1", store_name: "Acme-US", status_text: "已发货", shipped_qty: 800, received_qty: 0, shipped_at: daysAgo(12),
    item_list: [{ sku: "BOT-750", msku: "BOT-750-US", asin: "B0MOCK0001", product_name: "保温杯", shipped_qty: 600, received_qty: 0 }, { sku: "YOGA-6MM", msku: "YOGA-6MM-US", shipped_qty: 200, received_qty: 0 }] },
  { id: 2, delivery_order_no: "FD-MOCK-002", shipment_id: "FBA18MOCKDE1", store_name: "Acme-DE", status_text: "已发货", shipped_qty: 200, received_qty: 50, shipped_at: daysAgo(5),
    item_list: [{ sku: "LAMP-01", msku: "LAMP-01-EU", shipped_qty: 200, received_qty: 50 }] },
  { id: 3, delivery_order_no: "FD-MOCK-003", shipment_id: "FBA18DONE", store_name: "Acme-US", status_text: "已完成", shipped_qty: 999, received_qty: 999, shipped_at: daysAgo(40),
    item_list: [{ sku: "BOT-750", shipped_qty: 999, received_qty: 999 }] },
  { id: 4, delivery_order_no: "FD-MOCK-004", shipment_id: "FBA18CANCEL", store_name: "Acme-UK", status_text: "已取消", shipped_qty: 0, item_list: [{ sku: "BOT-750", shipped_qty: 300, received_qty: 0 }] },
  { id: 5, delivery_order_no: "FD-MOCK-005", shipment_id: "FBA18PLAN", store_name: "Acme-US", status_text: "待发货", shipped_qty: 0, shipped_at: "", item_list: [{ sku: "YOGA-6MM", shipped_qty: 100, received_qty: 0 }] },
];

function buildOrders() {
  const plan = [
    { store: stores[0], sku: "BOT-750", msku: "BOT-750-US", asin: "B0MOCK0001", base: 30 },
    { store: stores[0], sku: "YOGA-6MM", msku: "YOGA-6MM-US", asin: "B0MOCK0002", base: 12 },
    { store: stores[1], sku: "BOT-750", msku: "BOT-750-UK", asin: "B0MOCK0001", base: 4 },
    { store: stores[2], sku: "LAMP-01", msku: "LAMP-01-EU", asin: "B0MOCK0003", base: 9 },
    { store: stores[3], sku: "LAMP-01", msku: "LAMP-01-EU", asin: "B0MOCK0003", base: 3 },
    { store: stores[4], sku: "BOT-750", msku: "BOT-750-JP", asin: "B0MOCK0001", base: 2 },
  ];
  const out = [];
  let n = 0;
  for (let d = 59; d >= 0; d--) {
    const date = daysAgo(d);
    for (const p of plan) {
      const units = Math.max(0, Math.round(p.base * (1 + 0.25 * Math.sin(d / 3 + p.base))));
      // Split a day's units into orders of 1-3 pieces.
      let left = units;
      while (left > 0) {
        const q = Math.min(left, 1 + (n % 3));
        left -= q;
        n++;
        const id = `${String(100 + (n % 900)).padStart(3, "0")}-${String(1000000 + n).slice(-7)}-${String(7000000 + n * 7).slice(-7)}`;
        const status = d <= 1 ? "Unshipped" : n % 97 === 0 ? "Canceled" : "Shipped";
        out.push({
          sid: p.store.sid,
          seller_name: p.store.name,
          amazon_order_id: id,
          order_status: status,
          sales_channel: p.store.channel,
          fulfillment_channel: "AFN",
          tracking_number: status === "Shipped" ? `TBA${String(300000000 + n)}` : "",
          purchase_date_local: `${date} 10:${pad(n % 60)}:00`,
          estimated_arrival_date: status === "Shipped" ? `${daysAgo(d - 4)}T23:59:59Z` : "",
          item_list: [{ asin: p.asin, quantity_ordered: q, seller_sku: p.msku, local_sku: p.sku, local_name: "" }],
        });
      }
    }
  }
  return out;
}
const orders = buildOrders();

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function page(rows, body, defLen) {
  const offset = Number(body.offset ?? 0);
  const length = PAGE_CAP ? Math.min(PAGE_CAP, Number(body.length ?? defLen)) : Number(body.length ?? defLen);
  return rows.slice(offset, offset + length);
}

const lingxing = {
  "/basicOpen/openapi/storage/fbaWarehouseDetail": (b) =>
    b.query_fba_storage_quantity_list !== undefined
      ? { status: 400, code: 400, message: "当前本地模拟查询不支持 query_fba_storage_quantity_list：未接通欧洲共享仓实时来源" }
      : { code: 0, message: "success", total: fbaStock.length, data: page(fbaStock, b, 20) },
  "/erp/sc/routing/data/local_inventory/inventoryDetails": (b) => ({ code: 0, message: "success", total: localStock.length, data: page(localStock, b, 20) }),
  "/erp/sc/routing/data/local_inventory/purchaseOrderList": (b) => ({ code: 0, message: "success", total: purchaseOrders.length, data: page(purchaseOrders, b, 500) }),
  "/erp/sc/routing/storage/shipment/getInboundShipmentList": (b) => ({ code: 0, message: "success", data: { list: page([], b, 20), total: 0 } }),
  "/erp/sc/data/mws/orders": (b) => {
    const rows = orders.filter((o) => (!b.start_date || o.purchase_date_local >= b.start_date) && (!b.end_date || o.purchase_date_local < b.end_date));
    return { code: 0, message: "success", total: rows.length, data: page(rows, b, 1000) };
  },
};

const rest = { "/api/v1/products": products, "/api/v1/warehouses": warehouses, "/api/v1/shipments": shipments, "/api/v1/fba-delivery-orders": deliveryOrders };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    console.log(`[mock-erp] ${req.method} ${url.pathname} ${raw.slice(0, 160)}`);
    if (url.pathname === "/healthz") return send(res, 200, { status: "ok", service: "模拟ERP(本地)" });
    if (url.pathname === "/api/auth-server/oauth/access-token") {
      if (body.appId !== USER || body.appSecret !== PASS) return send(res, 401, { code: 401, message: "账号或密码无效", data: null });
      const token = `tok-${Math.random().toString(36).slice(2)}`;
      tokens.set(token, Date.now() + 3600_000);
      return send(res, 200, { code: 0, message: "success", data: { access_token: token, refresh_token: `r-${token}`, expires_in: 3600, token_type: "Bearer", role: "admin" } });
    }
    const auth = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!auth || !(tokens.get(auth) > Date.now())) return send(res, 401, { code: 401, message: "需要有效登录会话", data: null });
    if (lingxing[url.pathname] && req.method === "POST") {
      const out = lingxing[url.pathname](body);
      return send(res, out.status ?? 200, out);
    }
    if (rest[url.pathname] && req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const all = rest[url.pathname];
      return send(res, 200, { items: all.slice(offset, offset + limit), total: all.length, limit, offset });
    }
    send(res, 404, { code: 404, message: "未实现的模拟接口" });
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`[mock-erp] listening on http://127.0.0.1:${PORT} (${orders.length} orders)`));
