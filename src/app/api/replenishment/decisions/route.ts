import { z } from "zod";
import { sql } from "@/lib/db";
import { requireViewer } from "@/lib/viewer";

const schema = z.object({
  skuId: z.number().int().positive(),
  suggestedQty: z.number().int().min(0),
  finalQty: z.number().int().min(0).max(10_000_000),
  reason: z.string().max(500).optional().default(""),
});

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  const { skuId, suggestedQty, finalQty, reason } = parsed.data;
  const deviates = suggestedQty > 0 ? Math.abs(finalQty - suggestedQty) / suggestedQty > 0.2 : finalQty > 0;
  if (deviates && reason.trim() === "") {
    return Response.json({ error: "与系统建议相差超过 20%，请填写调整原因" }, { status: 400 });
  }
  const exists = await sql("select 1 from skus where id = $1", [skuId]);
  if (exists.length === 0) return Response.json({ error: "SKU 不存在" }, { status: 404 });
  await sql(
    "insert into replenishment_decisions (sku_id, suggested_qty, final_qty, reason, decided_by) values ($1, $2, $3, $4, $5)",
    [skuId, suggestedQty, finalQty, reason.trim() || null, viewer.name],
  );
  return Response.json({ ok: true });
}
