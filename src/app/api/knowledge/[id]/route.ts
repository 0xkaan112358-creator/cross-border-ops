import { sql } from "@/lib/db";
import { requireViewer } from "@/lib/viewer";

export async function GET(request: Request, ctx: RouteContext<"/api/knowledge/[id]">) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const id = Number((await ctx.params).id);
  const docs = await sql<{ id: number; title: string; category: string }>(
    "select id, title, category from kb_documents where id = $1",
    [id],
  );
  if (docs.length === 0) return Response.json({ error: "文档不存在" }, { status: 404 });
  const chunks = await sql<{ id: number; idx: number; heading: string | null; content: string }>(
    "select id, idx, heading, content from kb_chunks where document_id = $1 order by idx",
    [id],
  );
  return Response.json({ ...docs[0], chunks });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/knowledge/[id]">) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const id = Number((await ctx.params).id);
  await sql("delete from kb_documents where id = $1", [id]);
  return Response.json({ ok: true });
}
