"use client";

import { CircleCheck, CircleX, PlugZap, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { MARKETPLACE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import type { SyncRun } from "@/lib/erp/sync";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Spinner } from "./ui/spinner";

export type ErpOverview = {
  config: { configured: true; host: string; pinned: boolean } | { configured: false; missing: string[] };
  runs: SyncRun[];
  dataSource: "erp" | "local";
};

const SOURCE_LABEL: Record<string, string> = {
  "api/v1/products": "产品列表",
  "api/v1/warehouses": "仓库列表",
  "basicOpen/openapi/storage/fbaWarehouseDetail": "FBA 库存",
  "erp/sc/routing/data/local_inventory/inventoryDetails": "仓库库存明细",
  "erp/sc/routing/data/local_inventory/purchaseOrderList": "采购单（近 365 天）",
  "erp/sc/routing/storage/shipment/getInboundShipmentList": "已发货的发货单",
  "erp/sc/data/mws/orders": "亚马逊订单（近 60 天）",
};

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{(value ?? 0).toLocaleString()}</div>
    </div>
  );
}

function duration(run: SyncRun) {
  const ms = run.summary.durationMs;
  return ms ? `，耗时 ${(ms / 1000).toFixed(1)} 秒` : "";
}

function LastRun({ run }: { run: SyncRun }) {
  if (run.status === "running") {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Spinner /> 同步进行中（{formatDateTime(run.started_at)} 开始，由 {run.triggered_by ?? "管理员"} 发起）
      </div>
    );
  }
  if (run.status === "failed") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 text-sm">
        <div className="flex items-center gap-1.5 font-medium text-red-700">
          <CircleX className="size-4" /> {formatDateTime(run.started_at)} 同步失败，数据没有变化
        </div>
        <p className="mt-1 text-red-700/90">{run.error}</p>
      </div>
    );
  }
  const s = run.summary;
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <CircleCheck className="size-4 text-emerald-600" />
        <span className="font-medium">
          {formatDateTime(run.finished_at ?? run.started_at)} 同步成功{duration(run)}
        </span>
        <span className="text-muted-foreground">· {run.triggered_by ?? "管理员"}</span>
        {s.firstSync && <Badge variant="secondary">首次同步，已清空示例数据</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="SKU × 站点" value={s.skus} />
        <Stat label="每日销量记录" value={s.salesRows} />
        <Stat label="在途货件明细" value={s.shipments} />
        <Stat label="订单" value={s.orders} />
      </div>
      {!!s.deactivated && (
        <p className="text-xs text-muted-foreground">另有 {s.deactivated} 个 SKU × 站点本次在 ERP 中没有库存、销量或货件，已从库存列表中隐藏。</p>
      )}
      {run.warnings.length > 0 && (
        <details className="group rounded-lg bg-amber-50/70 p-3 text-xs">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-amber-800">
            <TriangleAlert className="size-3.5" /> {run.warnings.length} 类数据需要留意（点击展开）
          </summary>
          <ul className="mt-2 space-y-1.5 text-amber-900">
            {run.warnings.map((w) => (
              <li key={w.code}>
                {w.message}
                {w.samples.length > 0 && <span className="text-amber-800/80">：{w.samples.join("、")}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {s.fetchStats && (
        <details className="rounded-lg bg-muted/40 p-3 text-xs">
          <summary className="cursor-pointer list-none font-medium">ERP 原始数据（用于核对同步是否完整）</summary>
          <table className="mt-2 w-full text-left">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-normal">接口</th>
                <th className="py-1 pr-2 text-right font-normal">拉取条数</th>
                <th className="py-1 pr-2 text-right font-normal">ERP 报告总数</th>
                <th className="py-1 text-right font-normal">页数</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.fetchStats).map(([path, st]) => (
                <tr key={path} className="border-t border-border/60">
                  <td className="py-1 pr-2 break-all">{SOURCE_LABEL[path] ?? path}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{st.fetched.toLocaleString()}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${st.total != null && st.total !== st.fetched ? "text-red-700" : ""}`}>
                    {st.total == null ? "未提供" : st.total.toLocaleString()}
                  </td>
                  <td className="py-1 text-right tabular-nums">{st.pages}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.breakdown && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Object.entries(s.breakdown).map(([title, rows]) => (
                <div key={title}>
                  <div className="mb-1 font-medium">{title}</div>
                  {rows.length === 0 ? (
                    <div className="text-muted-foreground">无数据</div>
                  ) : (
                    <ul className="space-y-0.5">
                      {rows.map(([k, n]) => (
                        <li key={k} className="flex justify-between gap-2">
                          <span className="truncate" title={k}>
                            {k}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{n.toLocaleString()}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      )}
      {s.stores && s.stores.length > 0 && (
        <details className="rounded-lg bg-muted/40 p-3 text-xs">
          <summary className="cursor-pointer list-none font-medium">店铺与站点对应（{s.stores.length} 个店铺）</summary>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {s.stores.map((st) => (
              <li key={st.sid} className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5">
                <span className="truncate">
                  {st.name || "未命名店铺"} <span className="text-muted-foreground">sid {st.sid}</span>
                </span>
                <span className={st.marketplace ? "" : "text-red-700"}>
                  {st.marketplace ? MARKETPLACE_LABEL[st.marketplace] : "未识别"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ErpSyncCard({ overview }: { overview: ErpOverview }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { config, runs, dataSource } = overview;
  const last = runs[0];

  const sync = async () => {
    setConfirmOpen(false);
    setSyncing(true);
    try {
      const res = await fetch("/api/erp/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "同步失败");
      toast.success("ERP 数据已同步");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setSyncing(false);
      router.refresh();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PlugZap className="size-4" /> 从 ERP 同步
          {dataSource === "erp" ? (
            <Badge variant="secondary">当前数据来自 ERP</Badge>
          ) : (
            <Badge variant="outline">当前为示例或表格导入数据</Badge>
          )}
        </CardTitle>
        <CardDescription>
          通过领星风格接口拉取 FBA 库存、本地仓和海外仓库存、采购待到货、已发货的 FBA 发货单和近 60 天亚马逊订单，产品资料来自 ERP 产品列表。
          ERP 中没有头程海运、空运和上架时效，新 SKU 按站点默认值填写，可以再用“SKU 主数据”表格调整，之后同步不会覆盖。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {config.configured ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => (dataSource === "erp" ? void sync() : setConfirmOpen(true))} disabled={syncing || last?.status === "running"}>
              {syncing ? <Spinner /> : <RefreshCw />} {syncing ? "正在同步…" : "立即同步"}
            </Button>
            <span className="text-xs text-muted-foreground">
              ERP 地址 {config.host}
              {config.pinned && " · 已校验服务器证书指纹"}
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            尚未配置 ERP 连接，系统继续使用示例数据或表格导入的数据。需要在应用密钥中填写
            {" "}
            <code className="text-xs">{config.missing.join("、")}</code>
            {" "}
            ；如果 ERP 使用自签名证书，还需要填写 <code className="text-xs">ERP_TLS_FINGERPRINT</code>。
          </div>
        )}
        {syncing && <p className="text-xs text-muted-foreground">正在从 ERP 拉取数据，数据量较大时可能需要一两分钟，请不要关闭页面。</p>}
        {last && <LastRun run={last} />}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>首次从 ERP 同步</DialogTitle>
            <DialogDescription>
              同步前会清空现有的 SKU、库存、销量、货件、订单、客服工单和补货记录（包括示例数据），然后写入 ERP 数据。知识库资料和参数设置不受影响。如果同步失败，现有数据保持不变。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void sync()}>确定同步</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
