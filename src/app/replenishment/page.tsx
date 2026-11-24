import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReplenishmentBoard, type PlanItem } from "@/components/replenishment-board";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sql } from "@/lib/db";
import { addDays, todayStr } from "@/lib/dates";
import { loadPlans } from "@/lib/inventory";
import { getReplenishmentSettings } from "@/lib/settings";

export default async function ReplenishmentPage() {
  const [plans, settings, decisions] = await Promise.all([
    loadPlans(),
    getReplenishmentSettings(),
    sql<{ sku_id: number; final_qty: number; decided_by: string | null; created_at: string }>(
      `select distinct on (sku_id) sku_id, final_qty, decided_by, created_at::text as created_at
       from replenishment_decisions where created_at >= $1 order by sku_id, created_at desc`,
      [addDays(todayStr(), -7)],
    ),
  ]);
  const decided = new Map(decisions.map((d) => [d.sku_id, d]));
  const items: PlanItem[] = plans
    .filter((p) => p.plan.orderQty > 0 || p.plan.shipFromDomesticQty > 0 || p.plan.airQty > 0)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      marketplace: p.marketplace,
      name: p.name,
      owner: p.owner,
      status: p.plan.status,
      sellableDays: p.plan.sellableDays,
      pipelineDays: p.plan.pipelineDays,
      leadTime: p.plan.leadTime,
      baseDaily: p.plan.baseDaily,
      orderQty: p.plan.orderQty,
      shipQty: p.plan.shipFromDomesticQty,
      airQty: p.plan.airQty,
      unavoidableStockoutDays: p.plan.unavoidableStockoutDays,
      unitCost: p.unit_cost,
      explanation: p.plan.explanation,
      decision: decided.get(p.id) ?? null,
    }));
  const orderTotal = items.reduce((s, i) => s + i.orderQty, 0);
  const orderAmount = items.reduce((s, i) => s + i.orderQty * i.unitCost, 0);
  const confirmed = items.filter((i) => i.decision).length;

  return (
    <>
      <PageHeader
        title="补货计划"
        description={`安全库存 ${settings.safetyDays} 天，到货后覆盖 ${settings.coverDays} 天。每周一确认一次，偏离建议超过 20% 需填写原因。`}
        actions={
          <a href="/api/replenishment/export?scope=plan" className={buttonVariants({ variant: "outline" })}>
            <Download /> 导出补货计划
          </a>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "需处理 SKU", value: items.length },
          { label: "建议下单总量", value: `${orderTotal.toLocaleString()} 件` },
          { label: "预计采购金额", value: `¥${Math.round(orderAmount).toLocaleString()}` },
          { label: "近 7 天已确认", value: `${confirmed} / ${items.length}` },
        ].map((k) => (
          <Card key={k.label} size="sm">
            <CardContent>
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <ReplenishmentBoard items={items} />
    </>
  );
}
