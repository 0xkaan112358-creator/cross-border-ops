import { Download } from "lucide-react";
import { InventoryTable, type InventoryItem } from "@/components/inventory-table";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { STOCK_STATUS, type StockStatus } from "@/lib/constants";
import { loadPlans } from "@/lib/inventory";
import { planActions } from "@/lib/plan-text";

export default async function InventoryPage(props: PageProps<"/inventory">) {
  const params = await props.searchParams;
  const statusParam = typeof params.status === "string" ? params.status : "";
  const initialStatus = (STOCK_STATUS as readonly string[]).includes(statusParam) ? (statusParam as StockStatus) : "all";
  const plans = await loadPlans();
  const items: InventoryItem[] = plans.map((p) => ({
    id: p.id,
    sku: p.sku,
    marketplace: p.marketplace,
    name: p.name,
    owner: p.owner,
    status: p.plan.status,
    baseDaily: p.plan.baseDaily,
    sellableDays: p.plan.sellableDays,
    pipelineDays: p.plan.pipelineDays,
    fbaAvailable: p.fba_available + p.fba_inbound,
    inTransit: p.in_transit,
    overseas: p.overseas_wh,
    domestic: p.domestic_wh,
    inProduction: p.in_production,
    actions: planActions(p.plan),
  }));
  const snapshot = plans.map((p) => p.snapshot_date).filter(Boolean).sort().at(-1);

  return (
    <>
      <PageHeader
        title="库存总览"
        description={`共 ${items.length} 个 SKU · 库存快照日期 ${snapshot ?? "—"}。可售天数已计入大促系数。`}
        actions={
          <a href="/api/replenishment/export?scope=all" className={buttonVariants({ variant: "outline" })}>
            <Download /> 导出 Excel
          </a>
        }
      />
      <InventoryTable items={items} initialStatus={initialStatus} />
    </>
  );
}
