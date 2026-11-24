import { MARKETPLACE_LABEL, STOCK_STATUS_LABEL } from "@/lib/constants";
import { todayStr } from "@/lib/dates";
import { buildWorkbook } from "@/lib/importer";
import { loadPlans } from "@/lib/inventory";
import { requireViewer } from "@/lib/viewer";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "plan";
  const plans = await loadPlans();
  const rows = plans
    .filter(
      (p) =>
        scope === "all" || p.plan.orderQty > 0 || p.plan.shipFromDomesticQty > 0 || p.plan.airQty > 0,
    )
    .map((p) => ({
      SKU: p.sku,
      站点: MARKETPLACE_LABEL[p.marketplace] ?? p.marketplace,
      品名: p.name,
      负责人: p.owner ?? "",
      状态: STOCK_STATUS_LABEL[p.plan.status],
      预测日均: p.plan.baseDaily,
      可售库存: p.plan.sellable,
      可售天数: p.plan.sellableDays ?? "",
      全部库存: p.plan.pipeline,
      全部库存天数: p.plan.pipelineDays ?? "",
      全程提前期: p.plan.leadTime,
      建议下单量: p.plan.orderQty,
      国内仓发货量: p.plan.shipFromDomesticQty,
      建议空运量: p.plan.airQty,
      建议下单日期: p.plan.orderDate ?? "",
      冗余数量: p.plan.excessQty,
      冗余金额: p.plan.excessValue,
      说明: p.plan.explanation,
    }));
  const file = buildWorkbook(scope === "all" ? "库存总览" : "补货计划", rows);
  const name = encodeURIComponent(`${scope === "all" ? "库存总览" : "补货计划"}-${todayStr()}.xlsx`);
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
    },
  });
}
