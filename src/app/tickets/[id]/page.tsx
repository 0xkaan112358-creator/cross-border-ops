import { ArrowLeft, BookOpen, Package } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoPermission } from "@/components/no-permission";
import { IntentBadge, TicketStatusBadge, UrgencyBadge } from "@/components/status-badge";
import { TicketWorkspace } from "@/components/ticket-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LANGUAGE_LABEL, MARKETPLACE_LABEL, SENTIMENT_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { getOrder, getTicket } from "@/lib/tickets";
import { canHandleTickets, getViewer } from "@/lib/viewer";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function TicketDetailPage(props: PageProps<"/tickets/[id]">) {
  const viewer = await getViewer();
  if (!viewer || !canHandleTickets(viewer.role)) return <NoPermission need="客服和管理员" />;
  const { id } = await props.params;
  const ticket = await getTicket(Number(id));
  if (!ticket) notFound();
  const order = ticket.order_id ? await getOrder(ticket.order_id) : null;
  const analyzed = ticket.route != null && !["new", "processing"].includes(ticket.status);

  return (
    <>
      <Link href="/tickets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> 返回工单列表
      </Link>
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">
            #{ticket.id} {ticket.subject ?? "客户消息"}
          </h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {ticket.customer_name ?? "买家"}
          {ticket.marketplace && ` · ${MARKETPLACE_LABEL[ticket.marketplace] ?? ticket.marketplace}`} · {ticket.channel} · 收到于{" "}
          {formatDateTime(ticket.received_at)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>客户原文</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.body}</p>
              {ticket.translation_zh && ticket.language !== "zh" && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">中文翻译</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.translation_zh}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <TicketWorkspace
            key={`${ticket.status}-${ticket.processed_at}`}
            ticket={{
              id: ticket.id,
              status: ticket.status,
              route: ticket.route,
              language: ticket.language,
              replyDraft: ticket.reply_draft,
              replyDraftZh: ticket.reply_draft_zh,
              finalReply: ticket.final_reply,
              handledBy: ticket.handled_by,
              sentAt: ticket.sent_at,
              flags: ticket.compliance_flags,
              aiMode: ticket.ai_mode,
            }}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI 分析</CardTitle>
            </CardHeader>
            <CardContent>
              {analyzed ? (
                <>
                  {ticket.summary && <p className="mb-3 rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">{ticket.summary}</p>}
                  <div className="divide-y">
                    <Row label="问题类型">
                      <IntentBadge intent={ticket.intent} />
                    </Row>
                    <Row label="紧急程度">
                      <UrgencyBadge urgency={ticket.urgency} />
                    </Row>
                    <Row label="客户情绪">{ticket.sentiment ? (SENTIMENT_LABEL[ticket.sentiment] ?? ticket.sentiment) : "—"}</Row>
                    <Row label="语言">{ticket.language ? (LANGUAGE_LABEL[ticket.language] ?? ticket.language) : "—"}</Row>
                    <Row label="AI 置信度">{ticket.confidence != null ? `${Math.round(ticket.confidence * 100)}%` : "—"}</Row>
                    <Row label="分流结果">
                      <span className={ticket.route === "auto" ? "font-medium text-violet-700" : "font-medium text-orange-700"}>
                        {ticket.route === "auto" ? "简单问题 · AI 起草" : "复杂问题 · 转人工"}
                      </span>
                    </Row>
                  </div>
                  {ticket.route_reason && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">原因：{ticket.route_reason}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">AI 正在分析这条消息…</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="size-4" /> 订单信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order ? (
                <div className="divide-y">
                  <Row label="订单号">
                    <span className="font-mono text-xs">{order.order_id}</span>
                  </Row>
                  {order.sku && <Row label="SKU">{order.sku}</Row>}
                  {order.purchase_date && <Row label="下单日期">{order.purchase_date}</Row>}
                  <Row label="物流状态">{order.shipping_status ?? "—"}</Row>
                  <Row label="承运商">{order.carrier ?? "—"}</Row>
                  <Row label="运单号">
                    <span className="font-mono text-xs">{order.tracking_no ?? "—"}</span>
                  </Row>
                  <Row label="预计送达">{order.est_delivery ?? "—"}</Row>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {ticket.order_id ? `订单 ${ticket.order_id} 未在系统中找到，可在“数据导入”上传订单物流表。` : "消息中没有识别到订单号。"}
                </p>
              )}
            </CardContent>
          </Card>

          {ticket.kb_refs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4" /> 参考资料
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.kb_refs.map((k) => (
                  <Link
                    key={k.chunkId}
                    href={`/knowledge?doc=${k.documentId}`}
                    className="block rounded-lg border px-3 py-2 text-sm hover:border-primary/40"
                  >
                    {k.title}
                    {k.heading && <span className="text-muted-foreground"> · {k.heading}</span>}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
