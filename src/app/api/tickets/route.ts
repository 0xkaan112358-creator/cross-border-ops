import { z } from "zod";
import { normalizeMarketplace } from "@/lib/constants";
import { sql } from "@/lib/db";
import { requireViewer } from "@/lib/viewer";

const schema = z.object({
  channel: z.string().max(50).optional(),
  marketplace: z.string().max(20).optional(),
  orderId: z.string().max(40).optional(),
  customerName: z.string().max(100).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().trim().min(2, "请填写消息内容").max(8000),
});

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin", "cs"]);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "请求格式不正确" }, { status: 400 });
  }
  const d = parsed.data;
  const rows = await sql<{ id: number }>(
    `insert into tickets (channel, marketplace, order_id, customer_name, subject, body, status)
     values ($1, $2, $3, $4, $5, $6, 'new') returning id`,
    [
      d.channel?.trim() || "手动录入",
      normalizeMarketplace(d.marketplace),
      d.orderId?.trim() || null,
      d.customerName?.trim() || null,
      d.subject?.trim() || null,
      d.body,
    ],
  );
  return Response.json({ id: rows[0].id });
}
