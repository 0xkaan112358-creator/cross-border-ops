import { z } from "zod";
import { MARKETPLACES } from "@/lib/constants";
import { sql } from "@/lib/db";
import { requireViewer } from "@/lib/viewer";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");
const schema = z
  .object({
    name: z.string().trim().min(1, "请填写大促名称").max(50),
    marketplace: z.enum(MARKETPLACES).nullable(),
    startDate: date,
    endDate: date,
    factor: z.number().min(0.1, "系数不能小于 0.1").max(10, "系数不能大于 10"),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "结束日期不能早于开始日期" });

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "请求格式不正确" }, { status: 400 });
  }
  const d = parsed.data;
  await sql("insert into promotions (name, marketplace, start_date, end_date, factor) values ($1, $2, $3, $4, $5)", [
    d.name,
    d.marketplace,
    d.startDate,
    d.endDate,
    d.factor,
  ]);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "参数不正确" }, { status: 400 });
  await sql("delete from promotions where id = $1", [id]);
  return Response.json({ ok: true });
}
