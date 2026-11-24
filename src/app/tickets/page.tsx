import { NoPermission } from "@/components/no-permission";
import { TicketBoard, type TicketListItem } from "@/components/ticket-board";
import { getCsSettings } from "@/lib/settings";
import { listTickets, ticketStats } from "@/lib/tickets";
import { canHandleTickets, getViewer } from "@/lib/viewer";

export default async function TicketsPage() {
  const viewer = await getViewer();
  if (!viewer || !canHandleTickets(viewer.role)) return <NoPermission need="客服和管理员" />;
  const [tickets, stats, cs] = await Promise.all([listTickets(), ticketStats(), getCsSettings()]);
  const items: TicketListItem[] = tickets.map((t) => ({
    id: t.id,
    channel: t.channel,
    marketplace: t.marketplace,
    orderId: t.order_id,
    customerName: t.customer_name,
    subject: t.subject,
    preview: t.body.slice(0, 140),
    summary: t.summary,
    language: t.language,
    intent: t.intent,
    urgency: t.urgency,
    sentiment: t.sentiment,
    route: t.route,
    routeReason: t.route_reason,
    status: t.status,
    receivedAt: t.received_at,
    sentAt: t.sent_at,
  }));
  return (
    <TicketBoard
      items={items}
      stats={{
        pendingHuman: stats.pending_human,
        draftReady: stats.draft_ready,
        sent: stats.sent,
        newCount: stats.new_count,
        autoRouted: stats.auto_routed,
        processed: stats.processed,
        autoSent: stats.auto_sent,
        autoSentUnchanged: stats.auto_sent_unchanged,
      }}
      threshold={cs.confidenceThreshold}
    />
  );
}
