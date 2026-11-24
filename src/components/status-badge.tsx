import {
  INTENT_LABEL,
  STOCK_STATUS_LABEL,
  TICKET_STATUS_LABEL,
  URGENCY_LABEL,
  type StockStatus,
  type TicketIntent,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

const STOCK_STYLE: Record<StockStatus, string> = {
  stockout_risk: "bg-red-50 text-red-700 ring-red-200",
  reorder: "bg-amber-50 text-amber-700 ring-amber-200",
  healthy: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  excess: "bg-sky-50 text-sky-700 ring-sky-200",
};

const DOT: Record<StockStatus, string> = {
  stockout_risk: "bg-red-500",
  reorder: "bg-amber-500",
  healthy: "bg-emerald-500",
  excess: "bg-sky-500",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <Pill className={STOCK_STYLE[status]}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      {STOCK_STATUS_LABEL[status]}
    </Pill>
  );
}

const TICKET_STYLE: Record<string, string> = {
  new: "bg-slate-50 text-slate-600 ring-slate-200",
  processing: "bg-slate-50 text-slate-600 ring-slate-200",
  pending_human: "bg-orange-50 text-orange-700 ring-orange-200",
  draft_ready: "bg-violet-50 text-violet-700 ring-violet-200",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-50 text-slate-500 ring-slate-200",
};

export function TicketStatusBadge({ status }: { status: string }) {
  return (
    <Pill className={TICKET_STYLE[status] ?? TICKET_STYLE.new}>
      {status === "processing" ? "AI 处理中" : (TICKET_STATUS_LABEL[status] ?? status)}
    </Pill>
  );
}

const URGENCY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 ring-red-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function UrgencyBadge({ urgency }: { urgency: string | null }) {
  if (!urgency) return null;
  return <Pill className={URGENCY_STYLE[urgency] ?? URGENCY_STYLE.low}>{URGENCY_LABEL[urgency] ?? urgency}</Pill>;
}

export function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return null;
  return (
    <Pill className="bg-background text-foreground ring-border">{INTENT_LABEL[intent as TicketIntent] ?? intent}</Pill>
  );
}
