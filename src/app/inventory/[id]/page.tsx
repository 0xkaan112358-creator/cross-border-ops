import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionForm } from "@/components/decision-form";
import { ExplainButton } from "@/components/explain-button";
import { SalesChart } from "@/components/sales-chart";
import { StockStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MARKETPLACE_LABEL, SHIP_METHOD_LABEL } from "@/lib/constants";
import { formatDateTime, formatMonthDay } from "@/lib/dates";
import { getSkuDetail } from "@/lib/inventory";
import { daysLabel } from "@/lib/plan-text";

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const TRANSIT_SOURCE_LABEL: Record<string, string> = { default: "站点默认值", erp: "ERP 历史货件实测", manual: "手动填写" };

const SEGMENTS = [
  { key: "fba_available", label: "FBA 可售", color: "bg-emerald-500" },
  { key: "fba_inbound", label: "FBA 入库中", color: "bg-emerald-300" },
  { key: "in_transit", label: "头程在途", color: "bg-sky-500" },
  { key: "overseas_wh", label: "海外仓", color: "bg-sky-300" },
  { key: "domestic_wh", label: "国内仓", color: "bg-amber-400" },
  { key: "in_production", label: "在产", color: "bg-slate-300" },
] as const;

export default async function SkuDetailPage(props: PageProps<"/inventory/[id]">) {
  const { id } = await props.params;
  const detail = await getSkuDetail(Number(id));
  if (!detail) notFound();
  const { row, chart, shipments, decisions } = detail;
  const { plan } = row;
  const total = SEGMENTS.reduce((s, seg) => s + row[seg.key], 0);
  const hasAction = plan.orderQty > 0 || plan.shipFromDomesticQty > 0 || plan.airQty > 0;

  return (
    <>
      <Link href="/inventory" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> 返回库存总览
      </Link>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold sm:text-2xl">{row.sku}</h1>
            <span className="text-sm text-muted-foreground">{MARKETPLACE_LABEL[row.marketplace]}</span>
            <StockStatusBadge status={plan.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {row.name}
            {row.asin && ` · ASIN ${row.asin}`}
            {row.category && ` · ${row.category}`}
            {row.owner && ` · 负责人 ${row.owner}`}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>补货建议</CardTitle>
            <CardDescription>
              安全库存 {plan.safetyDays} 天 · 到货后覆盖 {plan.coverDays} 天 · 箱规 {row.case_pack}
              {row.moq > 0 && ` · 起订量 ${row.moq}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasAction ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">建议下单</div>
                  <div className="text-2xl font-semibold tabular-nums">{plan.orderQty.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.orderQty > 0 ? `今天（${formatMonthDay(plan.orderDate)}）下单` : "暂不需要"}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">国内仓尽快发货</div>
                  <div className="text-2xl font-semibold tabular-nums">{plan.shipFromDomesticQty.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">海运约 {plan.seaLead} 天上架</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">空运衔接</div>
                  <div className="text-2xl font-semibold tabular-nums">{plan.airQty.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {plan.unavoidableStockoutDays > 0 ? `仍可能断货约 ${plan.unavoidableStockoutDays} 天` : `空运约 ${plan.airLead} 天上架`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                {plan.status === "excess"
                  ? `库存偏多：约 ${plan.excessQty.toLocaleString()} 件冗余（约 ¥${plan.excessValue.toLocaleString()}），建议暂停补货。`
                  : plan.orderDate
                    ? `暂不需要补货，预计 ${formatMonthDay(plan.orderDate)} 前后需要下一次下单。`
                    : "暂无销量，无需补货。"}
              </div>
            )}

            <div className="rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">{plan.explanation}</div>
            {plan.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {plan.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <ExplainButton skuId={row.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>确认补货数量</CardTitle>
            <CardDescription>与建议相差超过 20% 时需要填写原因，记录会用于复盘</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DecisionForm skuId={row.id} suggestedQty={plan.orderQty} />
            {decisions.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="text-xs font-medium text-muted-foreground">历史记录</div>
                <ul className="space-y-2 text-xs">
                  {decisions.map((d) => (
                    <li key={d.id}>
                      <span className="font-medium">{d.final_qty.toLocaleString()} 件</span>
                      <span className="text-muted-foreground">（建议 {d.suggested_qty.toLocaleString()}）</span>
                      <span className="text-muted-foreground"> · {d.decided_by} · {formatDateTime(d.created_at)}</span>
                      {d.reason && <div className="text-muted-foreground">原因：{d.reason}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="预测日均" value={`${plan.baseDaily} 件`} hint={`近7/14/30天：${plan.avg7 ?? "—"} / ${plan.avg14 ?? "—"} / ${plan.avg30 ?? "—"}`} />
        <Metric label="可售天数" value={daysLabel(plan.sellableDays)} hint={`可售库存 ${plan.sellable.toLocaleString()} 件`} />
        <Metric label="全部库存天数" value={daysLabel(plan.pipelineDays)} hint={`含国内仓和在产，共 ${plan.pipeline.toLocaleString()} 件`} />
        <Metric
          label="全程提前期"
          value={`${plan.leadTime} 天`}
          hint={`生产 ${row.production_days} + 海运 ${row.sea_days}（${TRANSIT_SOURCE_LABEL[row.transit_source] ?? "默认"}）+ 上架 ${row.receiving_days}`}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>库存构成</CardTitle>
          <CardDescription>共 {total.toLocaleString()} 件{row.aged_qty > 0 && `，其中超龄库存 ${row.aged_qty.toLocaleString()} 件`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {total > 0 &&
              SEGMENTS.map((seg) =>
                row[seg.key] > 0 ? (
                  <div key={seg.key} className={seg.color} style={{ width: `${(row[seg.key] / total) * 100}%` }} />
                ) : null,
              )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {SEGMENTS.map((seg) => (
              <div key={seg.key} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-sm ${seg.color}`} />
                <span className="text-muted-foreground">{seg.label}</span>
                <span className="ml-auto font-medium tabular-nums lg:ml-0">{row[seg.key].toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>销量走势与预测</CardTitle>
          <CardDescription>近 60 天实际销量（红色为断货日）和未来 45 天预测（已计入大促系数）</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesChart data={chart} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>货件</CardTitle>
          <CardDescription>头程在途和入库中的货件</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {shipments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">暂无在途货件。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">货件号</TableHead>
                  <TableHead>方式</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead>发货日期</TableHead>
                  <TableHead className="pr-4">预计到达</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4 font-mono text-xs">{s.shipment_no}</TableCell>
                    <TableCell>{SHIP_METHOD_LABEL[s.method] ?? s.method}</TableCell>
                    <TableCell>{s.status}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.qty.toLocaleString()}</TableCell>
                    <TableCell>{s.ship_date ?? "—"}</TableCell>
                    <TableCell className="pr-4">{s.eta ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
