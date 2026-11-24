"use client";

import { CircleCheck, PartyPopper } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MARKETPLACE_LABEL, type StockStatus } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { daysLabel } from "@/lib/plan-text";
import { DecisionForm } from "./decision-form";
import { StockStatusBadge } from "./status-badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";

export type PlanItem = {
  id: number;
  sku: string;
  marketplace: string;
  name: string;
  owner: string | null;
  status: StockStatus;
  sellableDays: number | null;
  pipelineDays: number | null;
  leadTime: number;
  baseDaily: number;
  orderQty: number;
  shipQty: number;
  airQty: number;
  unavoidableStockoutDays: number;
  unitCost: number;
  explanation: string;
  decision: { final_qty: number; decided_by: string | null; created_at: string } | null;
};

function Num({ value, unit = "件" }: { value: number; unit?: string }) {
  if (value <= 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-semibold tabular-nums">
      {value.toLocaleString()}
      <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
    </span>
  );
}

export function ReplenishmentBoard({ items }: { items: PlanItem[] }) {
  const [active, setActive] = useState<PlanItem | null>(null);

  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PartyPopper />
          </EmptyMedia>
          <EmptyTitle>本周没有需要补货的 SKU</EmptyTitle>
          <EmptyDescription>所有 SKU 的库存都在安全范围内。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {items.map((i) => (
          <Card key={i.id} size="sm" className="px-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 lg:w-72">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/inventory/${i.id}`} className="font-medium hover:underline">
                    {i.sku}
                  </Link>
                  <span className="text-xs text-muted-foreground">{MARKETPLACE_LABEL[i.marketplace]}</span>
                  <StockStatusBadge status={i.status} />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {i.name}
                  {i.owner && ` · ${i.owner}`}
                </div>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-3 text-sm sm:grid-cols-5">
                <div>
                  <div className="text-xs text-muted-foreground">可售 / 提前期</div>
                  <div className="tabular-nums">
                    <span className={i.status === "stockout_risk" ? "font-semibold text-red-600" : "font-semibold"}>
                      {daysLabel(i.sellableDays)}
                    </span>
                    <span className="text-xs text-muted-foreground"> / {i.leadTime} 天</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">预测日均</div>
                  <div className="font-semibold tabular-nums">{i.baseDaily}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">建议下单</div>
                  <Num value={i.orderQty} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">国内仓发货</div>
                  <Num value={i.shipQty} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">空运衔接</div>
                  <Num value={i.airQty} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 lg:w-56 lg:justify-end">
                {i.decision ? (
                  <div className="text-xs text-emerald-700">
                    <div className="flex items-center gap-1 font-medium">
                      <CircleCheck className="size-3.5" /> 已确认 {i.decision.final_qty.toLocaleString()} 件
                    </div>
                    <div className="text-muted-foreground">
                      {i.decision.decided_by} · {formatDateTime(i.decision.created_at)}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">待确认</span>
                )}
                <Button size="sm" variant={i.decision ? "outline" : "default"} onClick={() => setActive(i)}>
                  {i.decision ? "修改" : "确认"}
                </Button>
              </div>
            </div>
            {i.unavoidableStockoutDays > 0 && (
              <div className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                即使空运仍可能断货约 {i.unavoidableStockoutDays} 天，建议同步控制广告预算。
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={active != null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  确认补货 · {active.sku} {MARKETPLACE_LABEL[active.marketplace]}
                </DialogTitle>
                <DialogDescription className="leading-relaxed">{active.explanation}</DialogDescription>
              </DialogHeader>
              <DecisionForm skuId={active.id} suggestedQty={active.orderQty} onSaved={() => setActive(null)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
