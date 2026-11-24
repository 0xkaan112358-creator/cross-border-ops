import { ArrowRight, Boxes, CircleAlert, Headset, PackageX, Ship, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QuickAsk } from "@/components/quick-ask";
import { StockStatusBadge } from "@/components/status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MARKETPLACE_LABEL, SHIP_METHOD_LABEL } from "@/lib/constants";
import { diffDays, formatMonthDay, todayStr } from "@/lib/dates";
import { getPromotions, getShipments, loadPlans } from "@/lib/inventory";
import { daysLabel, planActions } from "@/lib/plan-text";
import { ticketStats } from "@/lib/tickets";
import { canHandleTickets, getViewer } from "@/lib/viewer";

function Kpi({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <Link href={href} className="group">
      <Card size="sm" className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className={`flex size-9 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="size-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const today = todayStr();
  const [plans, shipments, promos, stats] = await Promise.all([
    loadPlans(),
    getShipments({ withinDays: 14 }),
    getPromotions(),
    ticketStats(),
  ]);

  const risk = plans.filter((p) => p.plan.status === "stockout_risk");
  const reorder = plans.filter((p) => p.plan.status === "reorder");
  const excess = plans.filter((p) => p.plan.status === "excess");
  const excessValue = excess.reduce((s, p) => s + p.plan.excessValue, 0);
  const urgent = [...risk, ...reorder].slice(0, 8);
  const upcomingPromos = promos.filter((p) => p.end_date >= today).slice(0, 3);
  const showTickets = canHandleTickets(viewer.role);

  return (
    <>
      <PageHeader
        title={`${viewer.name}，你好`}
        description={`今天是 ${formatMonthDay(today)}，以下是库存与客服的最新情况。`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="断货风险"
          value={risk.length}
          hint="需要立即处理的 SKU"
          href="/inventory?status=stockout_risk"
          icon={CircleAlert}
          tone="bg-red-50 text-red-600"
        />
        <Kpi
          label="需补货"
          value={reorder.length}
          hint="已到补货点的 SKU"
          href="/replenishment"
          icon={TrendingUp}
          tone="bg-amber-50 text-amber-600"
        />
        <Kpi
          label="冗余库存"
          value={`¥${Math.round(excessValue / 1000).toLocaleString()}k`}
          hint={`${excess.length} 个 SKU 库存偏多`}
          href="/inventory?status=excess"
          icon={PackageX}
          tone="bg-sky-50 text-sky-600"
        />
        {showTickets ? (
          <Kpi
            label="待处理工单"
            value={stats.pending_human + stats.draft_ready + stats.new_count}
            hint={`待人工 ${stats.pending_human} · AI 草稿待确认 ${stats.draft_ready}`}
            href="/tickets"
            icon={Headset}
            tone="bg-violet-50 text-violet-600"
          />
        ) : (
          <Kpi
            label="在售 SKU"
            value={plans.length}
            hint="覆盖美国站和欧洲站"
            href="/inventory"
            icon={Boxes}
            tone="bg-emerald-50 text-emerald-600"
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>需要优先处理</CardTitle>
            <CardDescription>按断货紧急程度排序，点击查看补货依据</CardDescription>
            <CardAction>
              <Link href="/replenishment" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                补货计划 <ArrowRight className="size-3.5" />
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {urgent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">所有 SKU 库存健康，暂时不需要补货。</p>
            ) : (
              <ul className="divide-y">
                {urgent.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/inventory/${p.id}`}
                      className="flex flex-col gap-1 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4 sm:px-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.sku}</span>
                          <span className="text-xs text-muted-foreground">{MARKETPLACE_LABEL[p.marketplace]}</span>
                          <StockStatusBadge status={p.plan.status} />
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{p.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground sm:w-28 sm:text-right">
                        可售 <span className="font-medium text-foreground">{daysLabel(p.plan.sellableDays)}</span>
                      </div>
                      <div className="text-xs font-medium sm:w-56 sm:text-right">{planActions(p.plan).join("；")}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> 问问助手
              </CardTitle>
              <CardDescription>库存、补货、平台规则和认证标准都可以直接问</CardDescription>
            </CardHeader>
            <CardContent>
              <QuickAsk />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ship className="size-4 text-primary" /> 未来 14 天到货
              </CardTitle>
              <CardDescription>头程在途货件</CardDescription>
            </CardHeader>
            <CardContent>
              {shipments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">未来 14 天没有预计到货的货件。</p>
              ) : (
                <ul className="space-y-2.5">
                  {shipments.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/inventory/${s.sku_id}`} className="min-w-0 hover:underline">
                        <span className="font-medium">{s.sku}</span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {MARKETPLACE_LABEL[s.marketplace]} · {SHIP_METHOD_LABEL[s.method] ?? s.method} · {s.qty} 件
                        </span>
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.eta ? `${formatMonthDay(s.eta)}（${diffDays(s.eta, today)} 天后）` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>大促日历</CardTitle>
              <CardDescription>大促期间的销量预测会乘以对应系数</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingPromos.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无即将到来的大促。</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {upcomingPromos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span>
                        {p.name}
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {p.marketplace ? MARKETPLACE_LABEL[p.marketplace] : "全部站点"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatMonthDay(p.start_date)}–{formatMonthDay(p.end_date)} · ×{p.factor}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
