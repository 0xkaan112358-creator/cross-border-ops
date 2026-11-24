import { z } from "zod";
import { sql } from "@/lib/db";
import { requireViewer } from "@/lib/viewer";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("邮箱格式不正确"),
  role: z.enum(["admin", "cs"]),
});

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "请求格式不正确" }, { status: 400 });
  }
  await sql(
    `insert into user_roles (email, role, updated_by, updated_at) values ($1, $2, $3, now())
     on conflict (email) do update set role = excluded.role, updated_by = excluded.updated_by, updated_at = now()`,
    [parsed.data.email, parsed.data.role, viewer.name],
  );
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return Response.json({ error: "参数不正确" }, { status: 400 });
  await sql("delete from user_roles where email = $1", [email]);
  return Response.json({ ok: true });
}
