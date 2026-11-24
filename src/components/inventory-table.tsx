"use client";

import { PackageSearch, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MARKETPLACE_LABEL, MARKETPLACES, STOCK_STATUS, STOCK_STATUS_LABEL, type StockStatus } from "@/lib/constants";
import { daysLabel } from "@/lib/plan-text";
import { cn } from "@/lib/utils";
import { StockStatusBadge } from "./status-badge";
import { Card } from "./ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

export type InventoryItem = {
  id: number;
  sku: string;
  marketplace: string;
  name: string;
  owner: string | null;
  status: StockStatus;
  baseDaily: number;
  sellableDays: number | null;
  pipelineDays: number | null;
  fbaAvailable: number;
  inTransit: number;
  overseas: number;
  domestic: number;
  inProduction: number;
  actions: string[];
};

const ALL = "all";

export function InventoryTable({ items, initialStatus }: { items: InventoryItem[]; initialStatus: StockStatus | "all" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);
  const [status, setStatus] = useState<StockStatus | "all">(initialStatus);

  const owners = useMemo(() => [...new Set(items.map((i) => i.owner).filter(Boolean))] as string[], [items]);
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (market === ALL || i.marketplace === market) &&
        (owner === ALL || i.owner === owner) &&
        (!q || `${i.sku} ${i.name}`.toLowerCase().includes(q)),
    );
  }, [items, query, market, owner]);
  const filtered = status === ALL ? base : base.filter((i) => i.status === status);
  const counts = Object.fromEntries(STOCK_STATUS.map((s) => [s, base.filter((i) => i.status === s).length]));

  const marketItems = [{ value: ALL, label: "全部站点" }, ...MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_LABEL[m] }))];
  const ownerItems = [{ value: ALL, label: "全部负责人" }, ...owners.map((o) => ({ value: o, label: o }))];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {([ALL, ...STOCK_STATUS] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {s === ALL ? "全部" : STOCK_STATUS_LABEL[s]}
              <span className="ml-1.5 tabular-nums opacity-70">{s === ALL ? base.length : counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 SKU 或品名"
              className="w-52 pl-8"
            />
          </div>
          <Select value={market} onValueChange={(v) => setMarket(v ?? ALL)} items={marketItems}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {marketItems.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => setOwner(v ?? ALL)} items={ownerItems}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ownerItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageSearch />
            </EmptyMedia>
            <EmptyTitle>{items.length === 0 ? "还没有库存数据" : "没有符合条件的 SKU"}</EmptyTitle>
            <EmptyDescription>
              {items.length === 0 ? (
                <>
                  请管理员到 <Link href="/import" className="text-primary underline">数据导入</Link> 上传 SKU、库存和销量数据。
                </>
              ) : (
                "试试调整筛选条件。"
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">SKU / 品名</TableHead>
                  <TableHead>站点</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">预测日均</TableHead>
                  <TableHead className="text-right">可售天数</TableHead>
                  <TableHead className="text-right">全部库存天数</TableHead>
                  <TableHead className="text-right">FBA</TableHead>
                  <TableHead className="text-right">在途</TableHead>
                  <TableHead className="text-right">国内仓</TableHead>
                  <TableHead className="pr-4">建议</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => router.push(`/inventory/${i.id}`)}>
                    <TableCell className="max-w-64 pl-4">
                      <Link href={`/inventory/${i.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {i.sku}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{i.name}</div>
                    </TableCell>
                    <TableCell className="text-sm">{MARKETPLACE_LABEL[i.marketplace]}</TableCell>
                    <TableCell>
                      <StockStatusBadge status={i.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{i.baseDaily}</TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", i.status === "stockout_risk" && "font-semibold text-red-600")}
                    >
                      {daysLabel(i.sellableDays)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{daysLabel(i.pipelineDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.fbaAvailable.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.inTransit.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.domestic.toLocaleString()}</TableCell>
                    <TableCell className="max-w-56 pr-4 text-xs whitespace-normal">{i.actions.join("；")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="grid gap-3 md:hidden">
            {filtered.map((i) => (
              <Link key={i.id} href={`/inventory/${i.id}`}>
                <Card size="sm" className="px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {i.sku} <span className="text-xs font-normal text-muted-foreground">{MARKETPLACE_LABEL[i.marketplace]}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{i.name}</div>
                    </div>
                    <StockStatusBadge status={i.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">预测日均</div>
                      <div className="font-medium tabular-nums">{i.baseDaily}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">可售天数</div>
                      <div className="font-medium tabular-nums">{daysLabel(i.sellableDays)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">全部库存</div>
                      <div className="font-medium tabular-nums">{daysLabel(i.pipelineDays)}</div>
                    </div>
                  </div>
                  {i.actions.length > 0 && <div className="text-xs font-medium">{i.actions.join("；")}</div>}
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
