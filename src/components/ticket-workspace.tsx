"use client";

import { CircleCheck, Copy, RefreshCw, ShieldCheck, TriangleAlert, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LANGUAGE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";

type Flag = { rule: string; level: "block" | "warn"; match: string };

type WorkspaceTicket = {
  id: number;
  status: string;
  route: "auto" | "human" | null;
  language: string | null;
  replyDraft: string | null;
  replyDraftZh: string | null;
  finalReply: string | null;
  handledBy: string | null;
  sentAt: string | null;
  flags: Flag[];
  aiMode: string | null;
};

async function act(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/tickets/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "操作失败"), { flags: data.flags as Flag[] | undefined });
  return data;
}

function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {flags.map((f, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs",
            f.level === "block" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
          )}
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            <span className="font-medium">{f.rule}</span>
            {f.level === "block" ? "（必须修改）" : "（建议修改）"}：“{f.match}”
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TicketWorkspace({ ticket }: { ticket: WorkspaceTicket }) {
  const router = useRouter();
  const [reply, setReply] = useState(ticket.replyDraft ?? "");
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);
  const pendingAi = ticket.status === "new" || ticket.status === "processing";
  const done = ticket.status === "sent" || ticket.status === "closed";

  useEffect(() => {
    if (ticket.status === "new" && !started.current) {
      started.current = true;
      act(ticket.id, { action: "regenerate" })
        .catch((e) => toast.error(e.message))
        .finally(() => router.refresh());
    } else if (ticket.status === "processing") {
      const t = setTimeout(() => router.refresh(), 2000);
      return () => clearTimeout(t);
    }
  }, [ticket.status, ticket.id, router]);

  const run = async (name: string, body: Record<string, unknown>, success?: string) => {
    setBusy(name);
    try {
      const data = await act(ticket.id, body);
      if (success) toast.success(success);
      router.refresh();
      return data;
    } catch (e) {
      const err = e as Error & { flags?: Flag[] };
      if (err.flags) setFlags(err.flags);
      toast.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    const data = await run("check", { action: "check", reply });
    if (data) {
      setFlags(data.flags);
      if (data.flags.length === 0) toast.success("话术检查通过");
    }
  };

  const send = async () => {
    const text = reply;
    const data = await run("send", { action: "send", reply: text });
    if (!data) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制回复，请粘贴到亚马逊买家消息中发送");
    } catch {
      toast.warning("已标记为已回复，但浏览器未允许写入剪贴板，请在已回复内容处手动复制");
    }
  };

  if (pendingAi) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <Spinner className="text-primary" /> AI 正在识别问题类型并起草回复…
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleCheck className="size-4 text-emerald-600" />
            {ticket.status === "sent" ? "已回复" : "已关闭"}
          </CardTitle>
          <CardDescription>
            {ticket.handledBy ?? "—"}
            {ticket.sentAt && ` · ${formatDateTime(ticket.sentAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ticket.finalReply && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap">{ticket.finalReply}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {ticket.finalReply && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(ticket.finalReply ?? "").then(() => toast.success("已复制"))}
              >
                <Copy /> 复制回复
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={busy != null} onClick={() => run("reopen", { action: "reopen" }, "工单已重新打开")}>
              重新打开
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isHuman = ticket.status === "pending_human";
  const lang = ticket.language ? (LANGUAGE_LABEL[ticket.language] ?? ticket.language) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isHuman ? "人工回复" : "AI 回复草稿"}</CardTitle>
        <CardDescription>
          {isHuman
            ? "AI 已起草了回复框架，请补充【待确认】的处理方案后发送。"
            : "AI 判断这是简单问题，请核对内容后一键复制发送。"}
          {lang && ` 回复语言：${lang}。`}
          {ticket.aiMode === "mock" && <span className="text-amber-700"> 当前为模拟模式（模板回复）。</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
            setFlags(null);
          }}
          rows={10}
          className="text-sm leading-relaxed"
        />
        {ticket.replyDraftZh && ticket.language !== "zh" && (
          <details className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">草稿中文对照（仅供理解，不会发送）</summary>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap">{ticket.replyDraftZh}</p>
          </details>
        )}
        <FlagList flags={flags ?? []} />
        {flags && flags.length === 0 && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
            <ShieldCheck className="size-3.5" /> 未发现违规话术
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={busy != null || !reply.trim()}>
            {busy === "send" ? <Spinner /> : <Copy />} 复制并标记已回复
          </Button>
          <Button variant="outline" onClick={check} disabled={busy != null || !reply.trim()}>
            {busy === "check" ? <Spinner /> : <ShieldCheck />} 话术检查
          </Button>
          <Button
            variant="outline"
            onClick={() => run("regenerate", { action: "regenerate" }, "已重新生成")}
            disabled={busy != null}
          >
            {busy === "regenerate" ? <Spinner /> : <RefreshCw />} 重新生成
          </Button>
          {!isHuman && (
            <Button variant="ghost" onClick={() => run("to_human", { action: "to_human" }, "已转人工处理")} disabled={busy != null}>
              <UserRound /> 转人工
            </Button>
          )}
          <Button variant="ghost" onClick={() => run("close", { action: "close" }, "工单已关闭")} disabled={busy != null}>
            <X /> 无需回复，关闭
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          一期暂未接入亚马逊消息接口：点击后回复会复制到剪贴板，请粘贴到卖家后台的买家消息中发送。
        </p>
      </CardContent>
    </Card>
  );
}
