import type { ReplenishmentPlan } from "./replenishment";
import { formatMonthDay } from "./dates";

export function planActions(plan: ReplenishmentPlan): string[] {
  const actions: string[] = [];
  if (plan.orderQty > 0) actions.push(`下单 ${plan.orderQty.toLocaleString()} 件`);
  if (plan.shipFromDomesticQty > 0) actions.push(`国内仓发货 ${plan.shipFromDomesticQty.toLocaleString()} 件`);
  if (plan.airQty > 0) actions.push(`空运约 ${plan.airQty.toLocaleString()} 件`);
  if (plan.status === "excess") actions.push(`冗余约 ${plan.excessQty.toLocaleString()} 件，暂停补货`);
  if (actions.length === 0 && plan.orderDate) actions.push(`预计 ${formatMonthDay(plan.orderDate)} 下单`);
  return actions;
}

export function daysLabel(days: number | null): string {
  if (days == null) return "—";
  if (days >= 365) return "365+ 天";
  return `${days} 天`;
}
