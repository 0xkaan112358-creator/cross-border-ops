"use client";

import { Download, Inbox, MessageSquarePlus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LANGUAGE_LABEL, MARKETPLACE_LABEL, SENTIMENT_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { NewTicketDialog } from "./new-ticket-dialog";
import { PageHeader } from "./page-header";
import { IntentBadge, TicketStatusBadge, UrgencyBadge } from "./status-badge";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Spinner } from "./ui/spinner";

export type TicketListItem = {
  id: number;
  channel: string;
  marketplace: string | null;
  orderId: string | null;
  customerName: string | null;
  subject: string | null;
  preview: string;
  summary: string | null;
  language: string | null;
  intent: string | null;
  urgency: string | null;
  sentiment: string | null;
  route: "auto" | "human" | null;
  routeReason: string | null;
  status: string;
  receivedAt: string;
  sentAt: string | null;
};

type Stats = {
  pendingHuman: number;
  draftReady: number;
  sent: number;
  newCount: number;
  autoRouted: number;
  processed: number;
  autoSent: number;
  autoSentUnchanged: number;
};

const TABS = [
  { key: "pending_human", label: "待人工处理" },
  { key: "draft_ready", label: "AI 草稿待确认" },
  { key: "sent", label: "已回复" },
  { key: "all", label: "全部" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TEMPLATE_URL = "/api/import/tickets";

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

export function TicketBoard({ items, stats, threshold }: { items: TicketListItem[]; stats: Stats; threshold: number }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(stats.pendingHuman > 0 ? "pending_human" : stats.draftReady > 0 ? "draft_ready" : "all");
  const [processing, setProcessing] = useState(false);
  const [liveRemaining, setRemaining] = useState<number | null>(null);
  const remaining = processing && liveRemaining != null ? liveRemaining : stats.newCount;
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);

  const runProcessing = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setProcessing(true);
    try {
      for (let round = 0; round < 50; round++) {
        const res = await fetch("/api/tickets/process", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "AI 处理失败");
        setRemaining(data.remaining);
        if (data.errors?.length) toast.warning(`${data.errors.length} 封消息 AI 处理失败，已转人工`);
        router.refresh();
        if (data.remaining === 0 || data.processed === 0) break;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 处理失败");
    } finally {
      running.current = false;
      setProcessing(false);
    }
  }, [router]);

  useEffect(() => {
    if (stats.newCount === 0) return;
    const timer = setTimeout(() => void runProcessing(), 0);
    return () => clearTimeout(timer);
  }, [stats.newCount, runProcessing]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/tickets", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "导入失败");
      const msg = `导入 ${data.inserted + data.updated} 条消息`;
      if (data.errors?.length) {
        toast.warning(`${msg}，${data.errors.length} 行有问题，例如第 ${data.errors[0].row} 行：${data.errors[0].message}`);
      }
      else toast.success(msg);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const counts: Record<TabKey, number> = {
    pending_human: items.filter((i) => i.status === "pending_human").length,
    draft_ready: items.filter((i) => i.status === "draft_ready").length,
    sent: items.filter((i) => i.status === "sent").length,
    all: items.length,
  };
  const filtered = tab === "all" ? items : items.filter((i) => i.status === tab);

  return (
    <>
      <PageHeader
        title="客服工单"
        description={`AI 先分拣客户消息：物流查询、产品使用等简单问题生成回复草稿，置信度低于 ${Math.round(threshold * 100)}% 或情绪激动、退换货、质量投诉等转人工。`}
        actions={
          <>
            <a href={TEMPLATE_URL} download className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <Download /> 模板
            </a>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Spinner /> : <Upload />} 批量导入
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
            <Button size="sm" onClick={() => setCreating(true)}>
              <MessageSquarePlus /> 录入客户消息
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">待人工处理</div>
            <div className="mt-1 text-xl font-semibold text-orange-600 tabular-nums">{stats.pendingHuman}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">AI 草稿待确认</div>
            <div className="mt-1 text-xl font-semibold text-violet-600 tabular-nums">{stats.draftReady}</div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">AI 可处理比例</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{pct(stats.autoRouted, stats.processed)}</div>
            <div className="text-xs text-muted-foreground">
              {stats.autoRouted} / {stats.processed} 封判定为简单问题
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">草稿采纳率</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{pct(stats.autoSentUnchanged, stats.autoSent)}</div>
            <div className="text-xs text-muted-foreground">
              AI 草稿未修改直接发出 {stats.autoSentUnchanged} / {stats.autoSent}
            </div>
          </CardContent>
        </Card>
      </div>

      {(processing || remaining > 0) && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          {processing ? <Spinner className="text-primary" /> : null}
          {processing ? `AI 正在分拣新消息，还剩 ${remaining} 封…` : `还有 ${remaining} 封新消息未处理`}
          {!processing && (
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => void runProcessing()}>
              开始处理
            </Button>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              tab === t.key ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {t.label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{items.length === 0 ? "还没有客户消息" : "这里已经清空了"}</EmptyTitle>
            <EmptyDescription>
              {items.length === 0 ? "点击“录入客户消息”粘贴一封买家邮件，或批量导入 Excel。" : "去其他分类看看吧。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-2">
          {filtered.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`}>
              <Card size="sm" className="px-4 transition-colors hover:border-primary/40">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">#{t.id}</span>
                      <span className="font-medium text-foreground">{t.customerName ?? "买家"}</span>
                      {t.marketplace && <span>{MARKETPLACE_LABEL[t.marketplace] ?? t.marketplace}</span>}
                      {t.language && <span>· {LANGUAGE_LABEL[t.language] ?? t.language}</span>}
                      {t.orderId && <span className="font-mono">· {t.orderId}</span>}
                      <span>· {t.channel}</span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{t.summary ?? t.subject ?? t.preview}</div>
                    {t.summary && (
                      <div className="truncate text-xs text-muted-foreground">{t.subject ?? t.preview}</div>
                    )}
                    {t.route === "human" && t.routeReason && t.status === "pending_human" && (
                      <div className="mt-1 text-xs text-orange-700">转人工原因：{t.routeReason}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:flex-col sm:items-end">
                    <TicketStatusBadge status={t.status} />
                    <div className="flex gap-1.5">
                      <IntentBadge intent={t.intent} />
                      <UrgencyBadge urgency={t.urgency} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t.sentiment && t.sentiment !== "calm" && `${SENTIMENT_LABEL[t.sentiment]} · `}
                      {formatDateTime(t.receivedAt)}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewTicketDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          setCreating(false);
          router.push(`/tickets/${id}`);
        }}
      />
    </>
  );
}
