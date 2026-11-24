import { z } from "zod";
import { tx } from "@/lib/db";
import { clearBusinessData, seedSampleData, seedSampleDocs } from "@/lib/seed";
import { requireViewer } from "@/lib/viewer";

const schema = z.object({ mode: z.enum(["sample", "empty"]) });

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  await tx(async (q) => {
    await clearBusinessData(q);
    if (parsed.data.mode === "sample") {
      await seedSampleData(q);
      await seedSampleDocs(q);
    } else {
      await q("delete from kb_documents where is_sample = true");
    }
  });
  return Response.json({ ok: true });
}
