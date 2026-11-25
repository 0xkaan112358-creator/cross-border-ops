import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { mapSnapshot, normalizeOrderStatus, type ErpSnapshot } from "@/lib/erp/mapping";

const TODAY = "2026-11-25";
type Row = Record<string, unknown>;

function snapshot(parts: Partial<ErpSnapshot>): ErpSnapshot {
  return { products: [], warehouses: [], fbaStock: [], localStock: [], purchaseOrders: [], shipments: [], deliveryOrders: [], orders: [], ...parts };
}

/** A US order (store sid 1, empty sales channel, as the real ERP returns them). */
function order(id: string, status: string, date: string, sku = "TEE-A", qty = 1): Row {
  return {
    sid: 1,
    seller_name: "MIMI Apparel US",
    amazon_order_id: id,
    order_status: status,
    sales_channel: "",
    purchase_date_local: `${date} 10:00:00`,
    item_list: [{ sku, quantity_ordered: qty }],
  };
}

const usOrder = order("O-1", "已发货", addDays(TODAY, -3));

describe("orders and sales", () => {
  it("normalizes Chinese and English order statuses", () => {
    expect(normalizeOrderStatus("已发货")).toBe("已发货");
    expect(normalizeOrderStatus("Shipped")).toBe("已发货");
    expect(normalizeOrderStatus("PartiallyShipped")).toBe("部分发货");
    expect(normalizeOrderStatus("Pending")).toBe("待发货");
    expect(normalizeOrderStatus("Canceled")).toBe("已取消");
    expect(normalizeOrderStatus("待审核")).toBe("待审核");
    expect(normalizeOrderStatus("")).toBeNull();
  });

  it("maps the store to a marketplace by name and leaves cancelled orders out of sales", () => {
    const m = mapSnapshot(
      snapshot({
        orders: [
          order("O-1", "已发货", addDays(TODAY, -3), "TEE-A", 3),
          order("O-2", "待审核", addDays(TODAY, -3), "TEE-A", 1),
          order("O-3", "已取消", addDays(TODAY, -3), "TEE-A", 50),
        ],
      }),
      TODAY,
      60,
    );
    expect(m.storeMarketplaces).toEqual([{ sid: "1", name: "MIMI Apparel US", marketplace: "US", source: "店铺名称" }]);
    expect(m.sales.filter((s) => s.in_stock).reduce((a, s) => a + s.units, 0)).toBe(4);
    expect(m.orders.map((o) => o.shipping_status)).toEqual(["已发货", "待审核", "已取消"]);
  });

  it("marks inferred out-of-stock days so the forecast skips them", () => {
    const orders = Array.from({ length: 30 }, (_, k) => k + 1)
      .filter((i) => i < 10 || i > 14)
      .map((i) => order(`O-${i}`, "已发货", addDays(TODAY, -i), "TEE-A", 4));
    const m = mapSnapshot(snapshot({ orders, fbaStock: [{ sid: 1, sku: "TEE-A", total_fulfillable_quantity: 80 }] }), TODAY, 30);
    const out = m.sales.filter((s) => !s.in_stock).map((s) => s.date);
    expect(out).toEqual([14, 13, 12, 11, 10].map((i) => addDays(TODAY, -i)));
    expect(m.warnings.map((w) => w.code)).toContain("stockout_inferred");
  });
});

describe("warehouse stock", () => {
  it("classifies warehouses by country first, then by type", () => {
    const m = mapSnapshot(
      snapshot({
        orders: [usOrder],
        warehouses: [
          { id: 1, name: "华东服装仓", warehouse_type: "本地仓", country: "中国" },
          { id: 2, name: "澄屿教学仓", warehouse_type: "自营仓", country: "US" },
          { id: 3, name: "平台仓A", warehouse_type: "平台仓", country: "美国" },
          { id: 4, name: "MVP 仓", warehouse_type: "local", country: "CN" },
          { id: 5, name: "FBA", warehouse_type: "FBA仓", country: "美国" },
        ],
        localStock: [
          { wid: 1, sku: "TEE-A", product_valid_num: 300 },
          { wid: 2, sku: "TEE-A", product_valid_num: 42 },
          { wid: 3, sku: "TEE-A", product_valid_num: 8 },
          { wid: 4, sku: "TEE-A", product_valid_num: 3 },
          { wid: 5, sku: "TEE-A", product_valid_num: 999 },
          { sku: "TEE-A", product_valid_num: 11 },
        ],
      }),
      TODAY,
      60,
    );
    const inv = m.inventory.get("TEE-A|US");
    expect(inv?.overseas_wh).toBe(50);
    expect(inv?.domestic_wh).toBe(314);
  });

  it("splits a shared European FBA pool by each marketplace's sales", () => {
    const sale = (id: string, channel: string, qty: number): Row => ({
      ...order(id, "Shipped", addDays(TODAY, -2), "LAMP", qty),
      sid: channel === "Amazon.de" ? 3 : 4,
      seller_name: channel === "Amazon.de" ? "Shop-DE" : "Shop-FR",
      sales_channel: channel,
    });
    const m = mapSnapshot(
      snapshot({
        orders: [sale("D1", "Amazon.de", 30), sale("F1", "Amazon.fr", 10)],
        fbaStock: [{ sid: 0, name: "欧洲共享仓", sku: "LAMP", share_type: 2, total_fulfillable_quantity: 300 }],
      }),
      TODAY,
      60,
    );
    expect(m.inventory.get("LAMP|DE")?.fba_available).toBe(225);
    expect(m.inventory.get("LAMP|FR")?.fba_available).toBe(75);
  });

  it("finds the marketplace of a store-0 FBA row from its seller group", () => {
    const m = mapSnapshot(
      snapshot({ orders: [usOrder], fbaStock: [{ sid: 0, name: "Amazon FBA", seller_group_name: "MIMI Autumn US", sku: "S01", total_fulfillable_quantity: 7 }] }),
      TODAY,
      60,
    );
    expect(m.inventory.get("S01|US")?.fba_available).toBe(7);
  });
});

describe("purchase orders", () => {
  const po = (sn: string, statusText: string, item: Row, status: unknown = null): Row => ({
    order_sn: sn,
    status,
    status_text: statusText,
    item_list: [{ sku: "TEE-A", is_delete: 0, ...item }],
  });

  it("counts approved and placed orders by status text, deriving pending units when the ERP leaves them empty", () => {
    const m = mapSnapshot(
      snapshot({
        orders: [usOrder],
        purchaseOrders: [
          po("P1", "待到货", { quantity_real: 100, quantity_entry: 0, quantity_receive: 0 }),
          po("P2", "部分入库", { quantity_real: 50, quantity_entry: 20 }),
          po("P3", "待下单", { quantity: 40 }),
          po("P4", "待到货", { quantity_real: 70, quantity_receive: 25 }),
          po("P5", "待到货", { quantity_real: 30, quantity_entry: 30 }),
          po("P6", "已完成", { quantity_real: 999 }),
          po("P7", "待审核", { quantity_real: 500 }),
          po("P8", "", { quantity_receive: 60 }, 2),
        ],
      }),
      TODAY,
      60,
    );
    // 100 + 30 + 40 + 25 + 0 + 60 (numeric status 2)
    expect(m.inventory.get("TEE-A|US")?.in_production).toBe(255);
  });
});

describe("inbound shipments", () => {
  const header = (id: string, statusText: string, amazonStatus: string, type = "海运", destination = "美国FBA平台仓"): Row => ({
    shipment_id: id,
    status_text: statusText,
    amazon_status: amazonStatus,
    shipment_type: type,
    destination,
    expected_arrival_date: "2026-12-10",
  });
  const delivery = (id: string, statusText: string, shippedAt: string, shipped: number, received: number, items: [string, number][], extra: Row = {}): Row => ({
    shipment_id: id,
    store_name: "MIMI Apparel Online",
    status_text: statusText,
    shipped_at: shippedAt,
    shipped_qty: shipped,
    received_qty: received,
    item_list: items.map(([sku, quantity]) => ({ sku, quantity })),
    ...extra,
  });

  it("keeps only shipped, unfinished orders and splits the order's remaining units across lines", () => {
    const m = mapSnapshot(
      snapshot({
        orders: [usOrder],
        shipments: [
          header("S1", "待配货", "未提交"),
          header("S2", "已接收", "未提交"),
          header("S3", "已签收", "CLOSED"),
          header("S4", "已签收", "未提交"),
          header("S5", "部分签收", "未提交"),
          header("S6", "运输中", "SHIPPED", "空运", "ONT8"),
        ],
        deliveryOrders: [
          delivery("S1", "待配货", "", 0, 0, [["TEE-A", 40]]),
          delivery("S2", "已完成", "2026-10-01", 60, 60, [["TEE-A", 60]]),
          delivery("S3", "已签收", "2026-10-20", 20, 20, [["TEE-A", 20]]),
          delivery("S4", "已签收", "2026-11-01", 30, 30, [["TEE-A", 30]]),
          delivery("S5", "部分签收", "2026-11-05", 100, 40, [["TEE-A", 75], ["TEE-B", 25]]),
          delivery("S6", "已发货", "2026-11-15", 12, 0, [["TEE-B", 12]], { store_name: "MIMI Autumn US" }),
        ],
      }),
      TODAY,
      60,
    );
    const lines = m.shipments.map((s) => [s.shipment_no, s.sku, s.qty, s.method, s.status]);
    expect(lines).toEqual([
      ["S5", "TEE-A", 45, "sea", "已到仓·入库中"],
      ["S5", "TEE-B", 15, "sea", "已到仓·入库中"],
      ["S6", "TEE-B", 12, "air", "运输中"],
    ]);
    expect(m.diagnostics["FBA发货单计入在途的件数按状态"]).toEqual([["部分签收", 60], ["已发货", 12]]);
  });

  it("measures first-mile transit days as the median of delivered shipments with an explicit mode", () => {
    const done = (id: string, type: string, shipped: string, received: string) => ({
      header: header(id, "已接收", "CLOSED", type),
      delivery: delivery(id, "已完成", shipped, 10, 10, [["TEE-A", 10]], { received_at: `${received} 12:00:00` }),
    });
    const samples = [
      done("A", "海运", "2026-09-01", "2026-09-29"),
      done("B", "海运", "2026-09-01", "2026-10-01"),
      done("C", "海运", "2026-09-01", "2026-10-06"),
      done("D", "海运", "2026-01-01", "2026-12-01"),
      done("E", "快递", "2026-09-01", "2026-09-05"),
      done("F", "空运", "2026-09-01", "2026-09-09"),
      done("G", "空运", "2026-09-01", "2026-09-11"),
    ];
    const m = mapSnapshot(
      snapshot({ orders: [usOrder], shipments: samples.map((x) => x.header), deliveryOrders: samples.map((x) => x.delivery) }),
      TODAY,
      60,
    );
    // Sea: 28, 30, 35 (the 334-day outlier and the express shipment are ignored). Air has only 2 samples.
    expect(m.transitDays).toEqual({ US: { sea: 30 } });
  });
});
